import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { sendError } from '../utils/response';

export interface JwtPayload {
  userId: string;
  role: string;
  name?: string;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'Authentication required');
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user) {
      sendError(res, 401, 'Invalid or expired token');
      return;
    }

    if (!user.isActive) {
      sendError(res, 401, 'Account is disabled');
      return;
    }

    req.user = { userId: user.id, role: user.role };
    next();
  } catch {
    sendError(res, 401, 'Invalid or expired token');
  }
}
