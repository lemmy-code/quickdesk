import type { Socket } from 'socket.io';
import { verifyToken, type TokenPayload } from '../lib/jwt';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';

export interface SocketUser extends TokenPayload {
  username: string;
}

declare module 'socket.io' {
  interface Socket {
    user: SocketUser;
  }
}

export async function socketAuth(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const token =
      (socket.handshake.auth.token as string | undefined) ??
      (socket.handshake.query.token as string | undefined);

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = {
      userId: payload.userId,
      role: payload.role,
      username: user.username,
    };

    // Mark user online
    await prisma.user.update({
      where: { id: payload.userId },
      data: { isOnline: true },
    });

    logger.info({ userId: payload.userId, socketId: socket.id }, 'Socket authenticated');
    next();
  } catch (err) {
    logger.warn({ err }, 'Socket auth failed');
    next(new Error('Invalid or expired token'));
  }
}
