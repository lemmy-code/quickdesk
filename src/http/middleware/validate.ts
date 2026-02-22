import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next({ statusCode: 400, message: err.issues[0].message, code: 'VALIDATION_ERROR' });
      } else {
        next(err);
      }
    }
  };
}

export function validateParams(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next({ statusCode: 400, message: err.issues[0].message, code: 'VALIDATION_ERROR' });
      } else {
        next(err);
      }
    }
  };
}
