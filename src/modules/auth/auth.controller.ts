import { Request, Response } from 'express';
import { login, getMe } from './auth.service';
import { LoginInput } from './auth.types';
import { sendSuccess, sendError } from '../../utils/response';
import { logger } from '../../lib/logger';

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const input: LoginInput = req.body;
    const result = await login(input);
    logger.info({ userId: result.user.id }, 'User logged in');
    sendSuccess(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    sendError(res, 401, message);
  }
}

export async function handleGetMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await getMe(userId);
    sendSuccess(res, user);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch user';
    sendError(res, 404, message);
  }
}
