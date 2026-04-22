import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors?: unknown
): void {
  res.status(statusCode).json({ success: false, message, ...(errors ? { errors } : {}) });
}
