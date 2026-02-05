import { MessageType } from '@prisma/client';
import { prisma } from '../lib/db';

interface PaginationOptions {
  cursor?: string;
  limit?: number;
  direction?: 'before' | 'after';
}

export async function getMessages(
  roomId: string,
  options: PaginationOptions = {},
) {
  const { cursor, limit = 50, direction = 'before' } = options;
  const take = limit + 1;

  const messages = await prisma.message.findMany({
    where: {
      roomId,
      ...(cursor
        ? {
            sentAt:
              direction === 'before'
                ? { lt: (await prisma.message.findUnique({ where: { id: cursor } }))!.sentAt }
                : { gt: (await prisma.message.findUnique({ where: { id: cursor } }))!.sentAt },
          }
        : {}),
    },
    include: { sender: true },
    orderBy: [{ sentAt: direction === 'before' ? 'desc' : 'asc' }, { id: 'desc' }],
    take,
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  // Always return oldest-first
  if (direction === 'before') messages.reverse();

  const nextCursor = hasMore ? messages[direction === 'before' ? 0 : messages.length - 1]?.id ?? null : null;

  return { messages, hasMore, nextCursor };
}

export async function createMessage(
  roomId: string,
  senderId: string | null,
  content: string,
  type: MessageType = MessageType.user,
) {
  return prisma.message.create({
    data: {
      roomId,
      senderId,
      content,
      type,
    },
    include: { sender: true },
  });
}

export async function createSystemMessage(roomId: string, content: string) {
  return createMessage(roomId, null, content, MessageType.system);
}
