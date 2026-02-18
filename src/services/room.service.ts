import { Role, RoomStatus } from '@prisma/client';
import { prisma } from '../lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors';
import { logger } from '../lib/logger';

const userSelect = { id: true, username: true, role: true } as const;

export async function createRoom(userId: string, title: string) {
  const room = await prisma.room.create({
    data: {
      title,
      createdBy: userId,
      members: {
        create: { userId },
      },
    },
    include: {
      creator: { select: userSelect },
      agent: { select: userSelect },
      members: { include: { user: { select: userSelect } } },
    },
  });

  // Try auto-assign — if it works, return updated room
  try {
    const assigned = await tryAutoAssign(room.id);
    if (assigned) return assigned;
  } catch (err) {
    logger.error(err, 'Auto-assign failed for room %s', room.id);
  }

  return room;
}

export async function listRooms(userId: string, role: string) {
  if (role === Role.agent || role === Role.admin) {
    return prisma.room.findMany({
      where: { status: { not: RoomStatus.closed } },
      include: {
        creator: { select: userSelect },
        agent: { select: userSelect },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // guest / customer — only their own rooms
  return prisma.room.findMany({
    where: { createdBy: userId },
    include: {
      creator: { select: userSelect },
      agent: { select: userSelect },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getRoom(roomId: string, userId: string, role: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      creator: { select: userSelect },
      agent: { select: userSelect },
      members: { include: { user: { select: userSelect } } },
    },
  });

  if (!room) {
    throw new NotFoundError('Room');
  }

  if (role !== Role.agent && role !== Role.admin && room.createdBy !== userId) {
    throw new ForbiddenError('Access denied');
  }

  return room;
}

export async function assignAgent(roomId: string, agentId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new NotFoundError('Room');
  if (room.status === RoomStatus.closed) {
    throw new ValidationError('Cannot assign agent to a closed room');
  }

  const agentUser = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agentUser) throw new NotFoundError('Agent');
  if (agentUser.role !== Role.agent && agentUser.role !== Role.admin) {
    throw new ValidationError('User is not an agent or admin');
  }

  const updated = await prisma.room.update({
    where: { id: roomId },
    data: {
      assignedTo: agentId,
      status: RoomStatus.active,
      members: {
        connectOrCreate: {
          where: { roomId_userId: { roomId, userId: agentId } },
          create: { userId: agentId },
        },
      },
    },
    include: {
      creator: { select: userSelect },
      agent: { select: userSelect },
      members: { include: { user: { select: userSelect } } },
    },
  });

  return updated;
}

export async function tryAutoAssign(roomId: string) {
  // Find online agent with fewest active rooms
  const agents = await prisma.user.findMany({
    where: {
      role: Role.agent,
      isOnline: true,
    },
    include: {
      _count: {
        select: {
          assignedRooms: {
            where: { status: RoomStatus.active },
          },
        },
      },
    },
    orderBy: {
      assignedRooms: { _count: 'asc' },
    },
    take: 1,
  });

  if (agents.length === 0) return null;

  return assignAgent(roomId, agents[0].id);
}

export async function closeRoom(roomId: string, userId: string, role: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new NotFoundError('Room');
  if (room.status === RoomStatus.closed) {
    throw new ValidationError('Room is already closed');
  }
  if (role !== Role.agent && role !== Role.admin) {
    throw new ForbiddenError('Only agents or admins can close rooms');
  }

  return prisma.room.update({
    where: { id: roomId },
    data: {
      status: RoomStatus.closed,
      closedAt: new Date(),
    },
    include: {
      creator: { select: userSelect },
      agent: { select: userSelect },
      members: { include: { user: { select: userSelect } } },
    },
  });
}
