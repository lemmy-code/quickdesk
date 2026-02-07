import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export async function listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isOnline: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

export async function changeRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role: req.body.role },
      select: { id: true, username: true, email: true, role: true },
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
