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
  user?: any;
}

// Auth Middleware
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  let token = req.headers.authorization?.split(' ')[1];

  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce(
      (acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
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
    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: { merchant: true },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
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
