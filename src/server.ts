import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
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
      (acc, cookie) => {
        const parts = cookie.trim().split('=');
        const key = parts[0];
        const value = parts.slice(1).join('=');
        // URL decode the value
        acc[key] = decodeURIComponent(value);
        return acc;
      },
      {} as Record<string, string>
    );

    // Debug: Log all cookie keys
    console.log('Available cookies:', Object.keys(cookies));

    token = cookies['better-auth.session_token'];
  }

  if (!token) {
    console.log('Auth failed: No token found in headers or cookies');
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

    console.log(
      `Auth check: Token extracted: ${cleanToken.substring(0, 10)}... (length: ${cleanToken.length})`
    );

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
      console.log('Auth failed: Session not found in DB');
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }

    if (session.expiresAt < new Date()) {
      console.log(`Auth failed: Session expired at ${session.expiresAt}`);
      return res.status(401).json({ error: 'Unauthorized: Session expired' });
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = session.user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:9000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  }
);

// Middleware
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
    console.error('Error fetching sessions:', error);
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
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 9001;

httpServer.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
  console.log(`CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:9000'}`);
  console.log(`AI enabled: ${process.env.AI_ENABLED === 'true'}`);
});
