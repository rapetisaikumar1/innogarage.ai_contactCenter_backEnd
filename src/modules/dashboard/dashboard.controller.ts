import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { getDashboardStats } from './dashboard.service';

// GET /api/dashboard
export async function handleGetStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getDashboardStats();
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}
