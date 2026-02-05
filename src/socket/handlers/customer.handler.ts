import { chatService } from '../../services/chat.service';
import { aiService } from '../../services/ai.service';
import { TypedSocket, TypedServer } from '../../types/chat.types';
import { sanitizeMessage, validateMessage } from '../../lib/sanitize';
import { messageRateLimiter, joinRateLimiter } from '../../lib/rate-limiter';
import { prisma } from '../../lib/prisma';

export function handleCustomerJoin(socket: TypedSocket, io: TypedServer) {
  socket.on(
    'customer:join',
    async ({ merchantId, customerName, customerEmail, customerId, customerToken }) => {
      try {
        // Rate limiting check
        if (joinRateLimiter.isRateLimited(socket.id)) {
          const resetTime = Math.ceil(joinRateLimiter.getResetTime(socket.id) / 1000);
          socket.emit('error', {
            message: `Too many join attempts. Please try again in ${resetTime} seconds.`,
          });
          return;
        }

        // Validate that merchant exists
        const merchant = await prisma.merchant.findUnique({
          where: { id: merchantId },
          select: { id: true, isChatEnabled: true },
        });

        if (!merchant) {
          socket.emit('error', { message: 'Merchant not found' });
          return;
        }

        if (merchant.isChatEnabled === false) {
          socket.emit('error', { message: 'Chat is currently disabled for this store' });
          return;
        }

        let session;

        if (customerId) {
          // Find or create session for returning customer
          session = await chatService.findOrCreateSession(
            merchantId,
            customerId,
            customerName,
            customerEmail,
            customerToken
          );
          console.log(
            `Customer ${customerName} (${customerId}) resumed/joined session ${session.id}`
          );
        } else {
          // Create new session for first-time customer
          session = await chatService.createSession(merchantId, customerName, customerEmail);
          console.log(`New customer ${customerName} joined session ${session.id}`);
        }

        // Store session data in socket
        socket.data.userType = 'customer';
        socket.data.merchantId = merchantId;
        socket.data.sessionId = session.id;

        // Join session room
        socket.join(`session:${session.id}`);
        socket.join(`merchant:${merchantId}`);

        // Make merchant join the session room
        io.in(`merchant:${merchantId}`).socketsJoin(`session:${session.id}`);

        // Send session created event
        socket.emit('session:created', session);

        // Check if merchant is online
        const sockets = await io.in(`merchant:${merchantId}`).fetchSockets();
        const isMerchantOnline = sockets.some((s) => s.data.userType === 'merchant');

        if (isMerchantOnline) {
          socket.emit('merchant:online', { merchantId });
        }

        // Get previous messages (if any)
        const messages = await chatService.getSessionMessages(session.id);
        socket.emit('session:history', messages);
      } catch (error) {
        console.error('Error in customer:join:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    }
  );
}

export function handleCustomerMessage(socket: TypedSocket, io: TypedServer) {
  socket.on('message:send', async ({ sessionId, content, senderType }) => {
    if (senderType !== 'customer') return;

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

      // Check if chat is still enabled for this merchant
      const merchant = await prisma.merchant.findUnique({
        where: { id: session.merchantId },
        select: { isChatEnabled: true },
      });

      if (merchant && merchant.isChatEnabled === false) {
        socket.emit('error', { message: 'Chat is currently disabled for this store' });
        return;
      }

      // Save message to database
      const message = await chatService.saveMessage(sessionId, sanitizedContent, 'customer');

      // Broadcast to session room
      io.to(`session:${sessionId}`).emit('message:receive', message);

      // If AI is enabled and merchant hasn't taken over, generate AI response
      if (session.aiEnabled && !session.merchantTookOver && aiService.isAIEnabled()) {
        // Prevent race conditions
        if (chatService.isAILocked(sessionId)) return;
        chatService.lockAI(sessionId);

        try {
          io.to(`session:${sessionId}`).emit('typing:start', { senderType: 'merchant' });

          const history = await chatService.getSessionMessages(sessionId);

          const aiResponse = await aiService.generateResponse(session.merchantId, history);

          io.to(`session:${sessionId}`).emit('typing:stop', { senderType: 'merchant' });

          const aiMessage = await chatService.saveMessage(sessionId, aiResponse, 'ai');

          io.to(`session:${sessionId}`).emit('ai:response', aiMessage);
        } finally {
          chatService.unlockAI(sessionId);
        }
      }
    } catch (error) {
      console.error('Error in message:send:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}
