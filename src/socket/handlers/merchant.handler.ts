import { Socket } from 'socket.io';
import { chatService } from '../../services/chat.service';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../../types/chat.types';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function handleMerchantJoin(socket: TypedSocket, io: any) {
  socket.on('merchant:join', async ({ merchantId }) => {
    try {
      // Security check: Verify merchant identity
      if (socket.data.userType !== 'merchant' || socket.data.merchantId !== merchantId) {
        console.warn(`Unauthorized merchant join attempt. Socket: ${socket.id}, Claimed: ${merchantId}, Actual: ${socket.data.merchantId}`);
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Join merchant room to receive all session notifications
      socket.join(`merchant:${merchantId}`);

      // Get all active sessions for this merchant
      const sessions = await chatService.getMerchantSessions(merchantId);

      // Join all active session rooms
      for (const session of sessions) {
        socket.join(`session:${session.id}`);
      }

      // Notify customers that merchant is online
      io.to(`merchant:${merchantId}`).emit('merchant:online', { merchantId });

      console.log(`Merchant ${merchantId} joined with ${sessions.length} active sessions`);
    } catch (error) {
      console.error('Error in merchant:join:', error);
      socket.emit('error', { message: 'Failed to join as merchant' });
    }
  });
}

export function handleMerchantMessage(socket: TypedSocket, io: any) {
  socket.on('message:send', async ({ sessionId, content, senderType }) => {
    if (senderType !== 'merchant') return;

    try {
      const session = await chatService.getSession(sessionId);
      
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Verify merchant owns this session
      if (session.merchantId !== socket.data.merchantId) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Save merchant message
      const message = await chatService.saveMessage(
        sessionId,
        content,
        'merchant',
        socket.data.merchantId
      );

      // Broadcast to session room
      io.to(`session:${sessionId}`).emit('message:receive', message);
    } catch (error) {
      console.error('Error in merchant message:send:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}

export function handleMerchantTakeover(socket: TypedSocket, io: any) {
  socket.on('merchant:takeover', async ({ sessionId }) => {
    try {
      const session = await chatService.getSession(sessionId);
      
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Verify merchant owns this session
      if (session.merchantId !== socket.data.merchantId) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Mark session as taken over by merchant
      await chatService.merchantTakeover(sessionId);

      // Notify all participants
      io.to(`session:${sessionId}`).emit('merchant:takeover', { sessionId });

      console.log(`Merchant took over session ${sessionId}`);
    } catch (error) {
      console.error('Error in merchant:takeover:', error);
      socket.emit('error', { message: 'Failed to takeover chat' });
    }
  });
}
