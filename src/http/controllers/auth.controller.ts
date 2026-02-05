import { Request, Response, NextFunction } from 'express';
import * as authService from '../../services/auth.service';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function guest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.createGuest();
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
