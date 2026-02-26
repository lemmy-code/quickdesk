import type { Server, Socket } from 'socket.io';
import { Events } from '../events';
import { prisma } from '../../lib/db';
import { pubClient } from '../../lib/redis';
import { logger } from '../../lib/logger';

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;

export function registerPresenceHandlers(io: Server, socket: Socket): void {
  // Increment socket count on connect
  pubClient.incr(PRESENCE_KEY(socket.user.userId)).catch((err) => {
    logger.error({ err, userId: socket.user.userId }, 'Failed to increment presence counter');
  });

  socket.on('disconnect', async () => {
    try {
      const count = await pubClient.decr(PRESENCE_KEY(socket.user.userId));

      if (count <= 0) {
        // Clean up the key and mark user offline
        await pubClient.del(PRESENCE_KEY(socket.user.userId));
        await prisma.user.update({
          where: { id: socket.user.userId },
          data: { isOnline: false },
        });
      }

      // Notify all rooms the user was in
      for (const roomId of socket.rooms) {
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
