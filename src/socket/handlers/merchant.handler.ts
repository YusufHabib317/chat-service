import { chatService } from '../../services/chat.service';
import { TypedSocket, TypedServer } from '../../types/chat.types';

export function handleMerchantJoin(socket: TypedSocket, io: TypedServer) {
  socket.on('merchant:join', async () => {
    try {
      // Strict Auth Check
      if (socket.data.userType !== 'merchant' || !socket.data.merchantId) {
        socket.emit('error', { message: 'Unauthorized: Invalid merchant credentials' });
        return;
      }

      const { merchantId } = socket.data;

      socket.join(`merchant:${merchantId}`);

      const sessions = await chatService.getMerchantSessions(merchantId);

      for (const session of sessions) {
        socket.join(`session:${session.id}`);
      }

      io.to(`merchant:${merchantId}`).emit('merchant:online', { merchantId });

      console.log(`Merchant ${merchantId} joined with ${sessions.length} active sessions`);
    } catch (error) {
      console.error('Error in merchant:join:', error);
      socket.emit('error', { message: 'Failed to join as merchant' });
    }
  });
}

export function handleMerchantMessage(socket: TypedSocket, io: TypedServer) {
  socket.on('message:send', async ({ sessionId, content, senderType }) => {
    if (senderType !== 'merchant') return;

    try {
      const session = await chatService.getSession(sessionId);

      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      if (session.merchantId !== socket.data.merchantId) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const message = await chatService.saveMessage(
        sessionId,
        content,
        'merchant',
        socket.data.merchantId
      );

      io.to(`session:${sessionId}`).emit('message:receive', message);

      // Automatically take over if not already
      if (!session.merchantTookOver) {
        await chatService.merchantTakeover(sessionId);
        io.to(`session:${sessionId}`).emit('merchant:takeover', { sessionId });
      }
    } catch (error) {
      console.error('Error in merchant message:send:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}

export function handleMerchantTakeover(socket: TypedSocket, io: TypedServer) {
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

export function handleMerchantReleaseTakeover(socket: TypedSocket, io: TypedServer) {
  socket.on('merchant:release_takeover', async ({ sessionId }) => {
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

      // Release takeover
      await chatService.releaseTakeover(sessionId);

      // Notify all participants
      io.to(`session:${sessionId}`).emit('merchant:release_takeover', { sessionId });

      console.log(`Merchant released takeover for session ${sessionId}`);
    } catch (error) {
      console.error('Error in merchant:release_takeover:', error);
      socket.emit('error', { message: 'Failed to release takeover' });
    }
  });
}
