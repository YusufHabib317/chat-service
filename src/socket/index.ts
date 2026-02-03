import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '../types/chat.types';
import { handleCustomerJoin, handleCustomerMessage } from './handlers/customer.handler';
import { handleMerchantJoin, handleMerchantMessage, handleMerchantTakeover } from './handlers/merchant.handler';
import { handleTyping } from './handlers/typing.handler';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function setupSocketHandlers(io: TypedServer) {
  // Authentication Middleware
  io.use(async (socket: TypedSocket, next) => {
    let token = socket.handshake.auth.token;

    // Try to get token from cookies if not in auth
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      
      // better-auth default cookie name
      token = cookies['better-auth.session_token'];
    }

    if (token) {
      try {
        const session = await prisma.session.findUnique({
          where: { token },
          include: {
            user: {
              include: { merchant: true }
            }
          }
        });

        if (session && session.expiresAt > new Date()) {
          socket.data.userId = session.userId;
          
          if (session.user.merchant) {
            socket.data.userType = 'merchant';
            socket.data.merchantId = session.user.merchant.id;
          }
        }
      } catch (error) {
        console.error('Authentication error:', error);
      }
    }
    next();
  });

  io.on('connection', (socket: TypedSocket) => {
    console.log('Client connected:', socket.id, socket.data.userType ? `(${socket.data.userType})` : '(guest)');

    // Customer handlers
    handleCustomerJoin(socket);
    handleCustomerMessage(socket, io);

    // Merchant handlers
    handleMerchantJoin(socket, io);
    handleMerchantMessage(socket, io);
    handleMerchantTakeover(socket, io);

    // Typing handlers
    handleTyping(socket, io);

    // Disconnect handler
    socket.on('disconnect', () => {
      const { userType, merchantId } = socket.data;
      
      if (userType === 'merchant' && merchantId) {
        // Notify customers that merchant is offline
        io.to(`merchant:${merchantId}`).emit('merchant:offline', { merchantId });
      }

      console.log('Client disconnected:', socket.id);
    });
  });
}
