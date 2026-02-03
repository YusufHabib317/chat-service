import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData
} from './types/chat.types';
import { setupSocketHandlers } from './socket';
import { chatService } from './services/chat.service';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:9000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:9000',
  credentials: true
}));
app.use(express.json());

// REST API Routes
app.get('/health', async (req: Request, res: Response) => {
  const dbHealth = await chatService.healthCheck();
  
  if (!dbHealth) {
    return res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiEnabled: process.env.AI_ENABLED === 'true'
  });
});

app.get('/api/merchants/:merchantId/sessions', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const sessions = await chatService.getMerchantSessions(merchantId);
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/sessions/:sessionId/messages', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const messages = await chatService.getSessionMessages(sessionId);
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
