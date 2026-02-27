import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from '../lib/redis';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { socketAuth } from './auth';
import { registerRoomHandlers } from './handlers/room.handler';
import { registerMessageHandlers } from './handlers/message.handler';
import { registerTypingHandlers } from './handlers/typing.handler';
import { registerPresenceHandlers } from './handlers/presence.handler';

export function setupSocketIO(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 64 * 1024, // 64KB max payload
  });

  io.adapter(createAdapter(pubClient, subClient));

  io.use(socketAuth);

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user.userId }, 'Client connected');

    registerRoomHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerPresenceHandlers(io, socket);
  });

  logger.info('Socket.IO server initialized');

  return io;
}
