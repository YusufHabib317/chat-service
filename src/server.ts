import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './types/chat.types';
import { setupSocketHandlers } from './socket';
import { chatService } from './services/chat.service';
import { prisma } from './lib/prisma';
import logger from './lib/logger';
import { destroyRateLimiters } from './lib/rate-limiter';

dotenv.config();

const app = express();

interface AuthenticatedRequest extends Request {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user?: any;
}

// Auth Middleware
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  let token = req.headers.authorization?.split(' ')[1];

  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce(
      (acc: Record<string, string>, cookie: string) => {
        const parts = cookie.trim().split('=');
        const key = parts[0];
        const value = parts.slice(1).join('=');
        // URL decode the value
        acc[key] = decodeURIComponent(value);
        return acc;
      },
      {} as Record<string, string>
    );

    token = cookies['better-auth.session_token'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Better Auth sends signed tokens in format: token.signature
    // We need to extract just the token part (before the dot)
    let cleanToken = token.trim();
    if (cleanToken.includes('.')) {
      // eslint-disable-next-line prefer-destructuring
      cleanToken = cleanToken.split('.')[0];
    }

    // Find session by token
    const session = await prisma.session.findUnique({
      where: { token: cleanToken },
      include: {
        user: {
          include: { merchant: true },
        },
      },
    });

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }

    if (session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Unauthorized: Session expired' });
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = session.user;
    next();
  } catch (error) {
    logger.error('Auth middleware error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const httpServer = createServer(app);

// Configure Socket.IO with connection limits and performance settings
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:9000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Connection limits and performance settings
    maxHttpBufferSize: 1e6, // 1MB max message size
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    connectTimeout: 45000, // 45 seconds
    // Allow max 10,000 concurrent connections (adjust based on server capacity)
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  }
);

// Middleware
// Security headers
app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:9000',
    credentials: true,
  })
);
app.use(express.json());

// REST API Routes
app.get('/health', async (req: Request, res: Response) => {
  const dbHealth = await chatService.healthCheck();

  if (!dbHealth) {
    return res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/merchants/:merchantId/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { user } = req as AuthenticatedRequest;

    // Verify ownership
    if (!user.merchant || user.merchant.id !== merchantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const sessions = await chatService.getMerchantSessions(merchantId, limit, offset);
    res.json(sessions);
  } catch (error) {
    logger.error('Error fetching sessions', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/sessions/:sessionId/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { user } = req as AuthenticatedRequest;

    const session = await chatService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership (Merchant can only see their own sessions)
    if (!user.merchant || user.merchant.id !== session.merchantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const messages = await chatService.getSessionMessages(sessionId, limit, offset);
    res.json(messages);
  } catch (error) {
    logger.error('Error fetching messages', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 9001;

httpServer.listen(PORT, () => {
  logger.info('Chat server started', {
    port: PORT,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:9000',
    aiEnabled: process.env.AI_ENABLED === 'true',
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info('Starting graceful shutdown', { signal });

  // Destroy rate limiters to prevent memory leaks
  destroyRateLimiters();

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close all Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  // Disconnect from database
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error disconnecting from database', error);
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason, { promise: String(promise) });
  gracefulShutdown('UNHANDLED_REJECTION');
});
