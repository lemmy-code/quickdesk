import type { Server, Socket } from 'socket.io';
import { Events } from '../events';
import { prisma } from '../../lib/db';
import { createSystemMessage } from '../../services/message.service';
import { logger } from '../../lib/logger';

export function registerRoomHandlers(io: Server, socket: Socket): void {
  socket.on(Events.ROOM_JOIN, async (roomId: string) => {
    try {
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        socket.emit(Events.ERROR, { message: 'Room not found' });
        return;
      }

      if (socket.user.role !== 'agent' && socket.user.role !== 'admin') {
        if (room.createdBy !== socket.user.userId) {
          socket.emit(Events.ERROR, { message: 'Access denied' });
          return;
        }
      }

      // Upsert room member
      await prisma.roomMember.upsert({
        where: {
          roomId_userId: { roomId, userId: socket.user.userId },
        },
        create: { roomId, userId: socket.user.userId },
        update: {},
      });

      socket.join(roomId);

      io.to(roomId).emit(Events.USER_JOINED, {
        userId: socket.user.userId,
        username: socket.user.username,
        roomId,
      });

      await createSystemMessage(roomId, `${socket.user.username} joined the room`);

      logger.info({ userId: socket.user.userId, roomId }, 'User joined room');
    } catch (err) {
      logger.error({ err, roomId }, 'Error joining room');
      socket.emit(Events.ERROR, { message: 'Failed to join room' });
    }
  });

  socket.on(Events.ROOM_LEAVE, async (roomId: string) => {
    try {
      if (!socket.rooms.has(roomId)) {
        return;
      }

      socket.leave(roomId);

      io.to(roomId).emit(Events.USER_LEFT, {
        userId: socket.user.userId,
        username: socket.user.username,
        roomId,
      });

      await createSystemMessage(roomId, `${socket.user.username} left the room`);

      logger.info({ userId: socket.user.userId, roomId }, 'User left room');
    } catch (err) {
      logger.error({ err, roomId }, 'Error leaving room');
      socket.emit(Events.ERROR, { message: 'Failed to leave room' });
    }
  });
}
