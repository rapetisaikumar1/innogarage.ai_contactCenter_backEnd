import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      sendError(res, 422, 'Validation failed', errors);
      return;
    }

    req.body = result.data;
    next();
  };
}
