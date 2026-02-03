import { Socket } from 'socket.io';
import { chatService } from '../../services/chat.service';
import { aiService } from '../../services/ai.service';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../../types/chat.types';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function handleCustomerJoin(socket: TypedSocket, io: any) {
  socket.on('customer:join', async ({ merchantId, customerName, customerEmail, customerId }) => {
    try {
      let session;

      if (customerId) {
        // Find or create session for returning customer
        session = await chatService.findOrCreateSession(
          merchantId,
          customerId,
          customerName,
          customerEmail
        );
        console.log(`Customer ${customerName} (${customerId}) resumed/joined session ${session.id}`);
      } else {
        // Create new session for first-time customer
        session = await chatService.createSession(
          merchantId,
          customerName,
          customerEmail
        );
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
      const isMerchantOnline = sockets.some((s: any) => s.data.userType === 'merchant');

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
  });
}

export function handleCustomerMessage(socket: TypedSocket, io: any) {
  socket.on('message:send', async ({ sessionId, content, senderType }) => {
    if (senderType !== 'customer') return;

    try {
      const session = await chatService.getSession(sessionId);
      
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Save customer message
      const message = await chatService.saveMessage(
        sessionId,
        content,
        'customer'
      );

      // Broadcast to session room
      io.to(`session:${sessionId}`).emit('message:receive', message);

      // If AI is enabled and merchant hasn't taken over, generate AI response
      if (session.aiEnabled && !session.merchantTookOver && aiService.isAIEnabled()) {
        // Emit typing start (simulate merchant typing)
        io.to(`session:${sessionId}`).emit('typing:start', { senderType: 'merchant' });

        // Get conversation history
        const history = await chatService.getSessionMessages(sessionId);

        // Generate AI response
        const aiResponse = await aiService.generateResponse(
          session.merchantId,
          history
        );

        // Emit typing stop
        io.to(`session:${sessionId}`).emit('typing:stop', { senderType: 'merchant' });

        if (aiResponse) {
          // Save AI message
          const aiMessage = await chatService.saveMessage(
            sessionId,
            aiResponse,
            'ai'
          );

          // Broadcast AI response
          io.to(`session:${sessionId}`).emit('ai:response', aiMessage);
        }
      }
    } catch (error) {
      console.error('Error in message:send:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}
