import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Attaches a unique X-Request-ID header to every request and response.
 * Makes it easy to trace logs for a specific request.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
}
