import { chatService } from '../../services/chat.service';
import { TypedSocket, TypedServer } from '../../types/chat.types';
import { sanitizeMessage, validateMessage } from '../../lib/sanitize';
import { messageRateLimiter, joinRateLimiter } from '../../lib/rate-limiter';
import logger from '../../lib/logger';

export function handleMerchantJoin(socket: TypedSocket, io: TypedServer) {
  socket.on('merchant:join', async () => {
    try {
      // Rate limiting check
      if (joinRateLimiter.isRateLimited(socket.id)) {
        const resetTime = Math.ceil(joinRateLimiter.getResetTime(socket.id) / 1000);
        socket.emit('error', {
          message: `Too many join attempts. Please try again in ${resetTime} seconds.`,
        });
        return;
      }

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

      logger.info('Merchant joined', { merchantId, activeSessions: sessions.length });
    } catch (error) {
      logger.error('Error in merchant:join', error, { socketId: socket.id });
      socket.emit('error', { message: 'Failed to join as merchant' });
    }
  });
}

export function handleMerchantMessage(socket: TypedSocket, io: TypedServer) {
  socket.on('message:send', async ({ sessionId, content, senderType }) => {
    if (senderType !== 'merchant') return;

    try {
      // Rate limiting check
      if (messageRateLimiter.isRateLimited(socket.id)) {
        const resetTime = Math.ceil(messageRateLimiter.getResetTime(socket.id) / 1000);
        socket.emit('error', {
          message: `Too many messages. Please wait ${resetTime} seconds before sending more.`,
        });
        return;
      }

      // Validate message content
      const validation = validateMessage(content);
      if (!validation.valid) {
        socket.emit('error', { message: validation.error || 'Invalid message' });
        return;
      }

      // Sanitize message content to prevent XSS
      const sanitizedContent = sanitizeMessage(content);

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
        sanitizedContent,
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
      logger.error('Error in merchant message:send', error, { socketId: socket.id });
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

      logger.session('info', 'Merchant took over session', sessionId, {
        merchantId: socket.data.merchantId,
      });
    } catch (error) {
      logger.error('Error in merchant:takeover', error, { socketId: socket.id });
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

      logger.session('info', 'Merchant released takeover', sessionId, {
        merchantId: socket.data.merchantId,
      });
    } catch (error) {
      logger.error('Error in merchant:release_takeover', error, { socketId: socket.id });
      socket.emit('error', { message: 'Failed to release takeover' });
    }
  });
}
