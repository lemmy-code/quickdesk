import type { Server, Socket } from 'socket.io';
import { Events } from '../events';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';

export function registerPresenceHandlers(io: Server, socket: Socket): void {
  socket.on('disconnect', async () => {
    try {
      // Mark user offline
      await prisma.user.update({
        where: { id: socket.user.userId },
        data: { isOnline: false },
      });

      // Notify all rooms the user was in
      for (const roomId of socket.rooms) {
        // Skip the default room (socket.id)
        if (roomId === socket.id) continue;

        io.to(roomId).emit(Events.USER_LEFT, {
          userId: socket.user.userId,
          username: socket.user.username,
          roomId,
        });
      }

      logger.info({ userId: socket.user.userId, socketId: socket.id }, 'User disconnected');
    } catch (err) {
      logger.error({ err, userId: socket.user.userId }, 'Error handling disconnect');
    }
  });
}
