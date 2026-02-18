import { Request, Response, NextFunction } from 'express';
import * as roomService from '../../services/room.service';
import * as messageService from '../../services/message.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await roomService.createRoom(req.user!.userId, req.body.title);
    res.status(201).json(room);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rooms = await roomService.listRooms(req.user!.userId, req.user!.role);
    res.status(200).json(rooms);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await roomService.getRoom(req.params.id as string, req.user!.userId, req.user!.role);
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
}

export async function assign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await roomService.assignAgent(req.params.id as string, req.body.agentId);
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
}

export async function close(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await roomService.closeRoom(req.params.id as string, req.user!.userId, req.user!.role);
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Verify room access before returning messages
    await roomService.getRoom(req.params.id as string, req.user!.userId, req.user!.role);
    const { cursor, limit, direction } = req.query;
    const result = await messageService.getMessages(req.params.id as string, {
      cursor: cursor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      direction: direction as 'before' | 'after' | undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
