import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { sendError } from '../utils/response';

/**
 * Validates `req.body` against the given schema.
 * On success, replaces `req.body` with the parsed (sanitized) data.
 */
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

/**
 * Validates `req.query` against the given schema.
 * On success, replaces `req.query` with the parsed (sanitized) data.
 * Useful for pagination, filters, etc. Use `z.coerce.number()` for numeric query params.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      sendError(res, 422, 'Invalid query parameters', errors);
      return;
    }

    // express's req.query is read-only on newer types; cast to bypass
    (req as Request & { query: unknown }).query = result.data;
    next();
  };
}

/**
 * Validates `req.params` against the given schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      sendError(res, 422, 'Invalid path parameters', errors);
      return;
    }

    (req as Request & { params: unknown }).params = result.data;
    next();
  };
}
