import type { Server, Socket } from 'socket.io';
import { Events } from '../events';
import { createMessage } from '../../services/message.service';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';

interface MessagePayload {
  roomId: string;
  content: string;
}

export function registerMessageHandlers(io: Server, socket: Socket): void {
  socket.on(Events.MESSAGE_SEND, async (data: MessagePayload) => {
    try {
      const { roomId, content } = data;

      if (!socket.rooms.has(roomId)) {
        socket.emit(Events.ERROR, { message: 'You must join the room first' });
        return;
      }

      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room || room.status === 'closed') {
        socket.emit(Events.ERROR, { message: 'Room not available' });
        return;
      }

      if (!content || !content.trim()) {
        socket.emit(Events.ERROR, { message: 'Message content cannot be empty' });
        return;
      }

      const message = await createMessage(roomId, socket.user.userId, content.trim());

      io.to(roomId).emit(Events.MESSAGE_NEW, message);

      logger.info({ userId: socket.user.userId, roomId, messageId: message.id }, 'Message sent');
    } catch (err) {
      logger.error({ err }, 'Error sending message');
      socket.emit(Events.ERROR, { message: 'Failed to send message' });
    }
  });
}
