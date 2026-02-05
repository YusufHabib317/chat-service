import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../types/chat.types';
import { handleCustomerJoin, handleCustomerMessage } from './handlers/customer.handler';
import {
  handleMerchantJoin,
  handleMerchantMessage,
  handleMerchantTakeover,
  handleMerchantReleaseTakeover,
} from './handlers/merchant.handler';
import { handleTyping } from './handlers/typing.handler';
import logger from '../lib/logger';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Connection tracking
let activeConnections = 0;
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '10000', 10);

export function setupSocketHandlers(io: TypedServer) {
  // Connection limit middleware
  io.use((socket: TypedSocket, next) => {
    if (activeConnections >= MAX_CONNECTIONS) {
      const error = new Error('Server at maximum capacity. Please try again later.');
      return next(error);
    }
    next();
  });

  // Authentication Middleware
  io.use(async (socket: TypedSocket, next) => {
    let token = socket.handshake.auth.token as string | undefined;

    // Try to get token from cookies if not in auth
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';').reduce(
        (acc, cookie) => {
          const [key, ...valueParts] = cookie.trim().split('=');
          acc[key] = decodeURIComponent(valueParts.join('='));
          return acc;
        },
        {} as Record<string, string>
      );

      // better-auth default cookie name
      token = cookies['better-auth.session_token'];
    }

    if (token) {
      try {
        // Better Auth sends signed tokens in format: token.signature
        // Extract just the token part (before the dot)
        let cleanToken = token.trim();
        if (cleanToken.includes('.')) {
          // eslint-disable-next-line prefer-destructuring
          cleanToken = cleanToken.split('.')[0];
        }

        const session = await prisma.session.findUnique({
          where: { token: cleanToken },
          include: {
            user: {
              include: { merchant: true },
            },
          },
        });

        if (session && session.expiresAt > new Date()) {
          socket.data.userId = session.userId;

          if (session.user.merchant) {
            socket.data.userType = 'merchant';
            socket.data.merchantId = session.user.merchant.id;
            logger.socket('info', 'Merchant authenticated', socket.id, {
              merchantId: session.user.merchant.id,
            });
          }
        } else {
          // Token provided but invalid or expired
          logger.socket('warn', 'Socket auth failed: Invalid or expired token', socket.id);
          return next(new Error('Authentication failed: Invalid or expired token'));
        }
      } catch (error) {
        logger.error('Authentication error', error, { socketId: socket.id });
        return next(new Error('Authentication failed: Internal error'));
      }
    }
    // If no token, proceed as guest (customer)
    next();
  });

  io.on('connection', (socket: TypedSocket) => {
    // Increment connection counter
    activeConnections += 1;

    logger.socket('info', 'Client connected', socket.id, {
      userType: socket.data.userType || 'guest',
      activeConnections,
      maxConnections: MAX_CONNECTIONS,
    });

    // Customer handlers
    handleCustomerJoin(socket, io);
    handleCustomerMessage(socket, io);

    // Merchant handlers
    handleMerchantJoin(socket, io);
    handleMerchantMessage(socket, io);
    handleMerchantTakeover(socket, io);
    handleMerchantReleaseTakeover(socket, io);

    // Typing handlers
    handleTyping(socket);

    // Disconnect handler
    socket.on('disconnect', () => {
      // Decrement connection counter
      activeConnections -= 1;

      const { userType, merchantId } = socket.data;

      if (userType === 'merchant' && merchantId) {
        // Notify customers that merchant is offline
        io.to(`merchant:${merchantId}`).emit('merchant:offline', { merchantId });
      }

      logger.socket('info', 'Client disconnected', socket.id, {
        activeConnections,
        maxConnections: MAX_CONNECTIONS,
      });
    });
  });

  // Export connection stats for monitoring
  return {
    getActiveConnections: () => activeConnections,
    getMaxConnections: () => MAX_CONNECTIONS,
  };
}
