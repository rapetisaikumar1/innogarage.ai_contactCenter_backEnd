import { NextFunction, Request, Response } from 'express';
import { validate, validateParams } from '../../middleware/validate';
import { parseMonthYearFilter } from '../../utils/monthYearFilter';
import { sendError, sendSuccess } from '../../utils/response';
import {
  createPaymentHistorySchema,
  paymentHistoryIdParamSchema,
  updatePaymentHistorySchema,
} from './paymentHistory.types';
import {
  createPaymentHistory,
  deletePaymentHistory,
  getPaymentHistory,
  listPaymentHistories,
  updatePaymentHistory,
} from './paymentHistory.service';

export async function handleListPaymentHistories(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedFilter = parseMonthYearFilter(req.query);
    if (parsedFilter.error) return sendError(res, 400, parsedFilter.error);

    const paymentHistories = await listPaymentHistories(parsedFilter.filter);
    sendSuccess(res, paymentHistories);
  } catch (err) {
    next(err);
  }
}

export const handleGetPaymentHistory = [
  validateParams(paymentHistoryIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentHistory = await getPaymentHistory(req.params.paymentHistoryId);

      if (!paymentHistory) {
        return sendError(res, 404, 'Payment history record not found');
      }

      sendSuccess(res, paymentHistory);
    } catch (err) {
      next(err);
    }
  },
];

export const handleCreatePaymentHistory = [
  validate(createPaymentHistorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentHistory = await createPaymentHistory(req.body, req.user!.userId);
      sendSuccess(res, paymentHistory, 201);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

export const handleUpdatePaymentHistory = [
  validateParams(paymentHistoryIdParamSchema),
  validate(updatePaymentHistorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentHistory = await updatePaymentHistory(req.params.paymentHistoryId, req.body, req.user!.userId);
      sendSuccess(res, paymentHistory);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

export const handleDeletePaymentHistory = [
  validateParams(paymentHistoryIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deletePaymentHistory(req.params.paymentHistoryId, req.user!.userId);
      sendSuccess(res, { id: req.params.paymentHistoryId });
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];