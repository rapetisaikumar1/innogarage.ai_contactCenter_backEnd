import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { sendError } from '../utils/response';
import { env } from '../config/env';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Zod validation errors (should normally be caught by validate middleware, but just in case)
  if (err instanceof ZodError) {
    sendError(res, 422, 'Validation failed', err.flatten().fieldErrors);
    return;
  }

  // Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn({ code: err.code, path: req.path }, 'Prisma request error');

    if (err.code === 'P2002') {
      sendError(res, 409, 'A record with this value already exists');
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 404, 'Record not found');
      return;
    }
    sendError(res, 400, 'Database operation failed');
    return;
  }

  // Prisma validation errors (bad query shape)
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn({ path: req.path }, 'Prisma validation error');
    sendError(res, 400, 'Invalid data provided');
    return;
  }

  // Generic Error with attached statusCode (used in services)
  if (err instanceof Error) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      sendError(res, statusCode, err.message);
      return;
    }
  }

  // Unknown / unexpected errors
  logger.error(
    { err, path: req.path, method: req.method },
    'Unhandled error'
  );

  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : (err instanceof Error ? err.message : 'Internal server error');

  sendError(res, 500, message);
}
