import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  logCall,
  updateCall,
  deleteCall,
  listCallsByCandidate,
  listCalls,
} from './calls.service';
import { logCallSchema, updateCallSchema, listCallsSchema } from './calls.types';

// POST /api/calls  — log a new call
export async function handleLog(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = logCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const call = await logCall(parsed.data, req.user!.userId);
    sendSuccess(res, call, 201);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/calls/:callId  — update duration/status/notes
export async function handleUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const call = await updateCall(
      req.params.callId,
      parsed.data,
      req.user!.userId,
      req.user!.role
    );
    sendSuccess(res, call);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Call not found') {
      return sendError(res, 404, err.message);
    }
    if (err instanceof Error && err.message.startsWith('Not authorised')) {
      return sendError(res, 403, err.message);
    }
    next(err);
  }
}

// DELETE /api/calls/:callId
export async function handleDelete(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCall(req.params.callId, req.user!.userId, req.user!.role);
    sendSuccess(res, { deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Call not found') {
      return sendError(res, 404, err.message);
    }
    if (err instanceof Error && err.message.startsWith('Not authorised')) {
      return sendError(res, 403, err.message);
    }
    next(err);
  }
}

// GET /api/candidates/:candidateId/calls  — per-candidate call history
export async function handleListByCandidate(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { calls, total } = await listCallsByCandidate(req.params.candidateId, page, limit);
    sendSuccess(res, {
      calls,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/calls  — dashboard: all calls with filters
export async function handleList(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listCallsSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const { calls, total } = await listCalls(parsed.data);
    sendSuccess(res, {
      calls,
      pagination: {
        total,
        page: parsed.data.page,
        limit: parsed.data.limit,
        totalPages: Math.ceil(total / parsed.data.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}
