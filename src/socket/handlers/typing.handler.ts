import type { Socket } from 'socket.io';
import { Events } from '../events';

interface TypingPayload {
  roomId: string;
}

export function registerTypingHandlers(_io: unknown, socket: Socket): void {
  socket.on(Events.TYPING_START, (data: TypingPayload) => {
    socket.to(data.roomId).emit(Events.TYPING_UPDATE, {
      userId: socket.user.userId,
      username: socket.user.username,
      roomId: data.roomId,
      isTyping: true,
    });
  });

  socket.on(Events.TYPING_STOP, (data: TypingPayload) => {
    socket.to(data.roomId).emit(Events.TYPING_UPDATE, {
      userId: socket.user.userId,
      username: socket.user.username,
      roomId: data.roomId,
      isTyping: false,
    });
  });
}
