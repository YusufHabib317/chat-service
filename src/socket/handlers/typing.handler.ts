import { Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, SocketData } from '../../types/chat.types';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function handleTyping(socket: TypedSocket, io: any) {
  socket.on('typing:start', ({ sessionId }) => {
    const senderType = socket.data.userType;
    if (!senderType) return;

    // Broadcast to others in the session
    socket.to(`session:${sessionId}`).emit('typing:start', { senderType });
  });

  socket.on('typing:stop', ({ sessionId }) => {
    const senderType = socket.data.userType;
    if (!senderType) return;

    // Broadcast to others in the session
    socket.to(`session:${sessionId}`).emit('typing:stop', { senderType });
  });
}
