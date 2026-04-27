import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response';
import { getDashboardStats } from './dashboard.service';

// GET /api/dashboard
export async function handleGetStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query;
    const fromDate = from && typeof from === 'string' ? new Date(from) : undefined;
    const toDate   = to   && typeof to   === 'string' ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined;
    const stats = await getDashboardStats(fromDate, toDate);
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}
