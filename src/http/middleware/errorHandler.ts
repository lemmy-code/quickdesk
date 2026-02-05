import { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger';
import { AppError } from '../../lib/errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if ('statusCode' in err && 'code' in err) {
    const e = err as unknown as { statusCode: number; code: string; message: string };
    res.status(e.statusCode).json({
      error: { code: e.code, message: e.message },
    });
    return;
  }

  logger.error(err, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
