import { Request, Response } from 'express';
import {
  listCandidates,
  getCandidateById,
  createCandidate,
  updateCandidate,
  updateCandidateStatus,
  assignCandidate,
} from './candidates.service';
import { sendSuccess, sendError } from '../../utils/response';
import { listCandidatesSchema } from './candidates.types';

export async function handleList(req: Request, res: Response): Promise<void> {
  try {
    const query = listCandidatesSchema.parse(req.query);
    const result = await listCandidates(query, req.user!.userId, req.user!.role);
    sendSuccess(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list candidates';
    sendError(res, 500, message);
  }
}

export async function handleGetOne(req: Request, res: Response): Promise<void> {
  try {
    const candidate = await getCandidateById(req.params.id);
    if (!candidate) {
      sendError(res, 404, 'Candidate not found');
      return;
    }
    sendSuccess(res, candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch candidate';
    sendError(res, 500, message);
  }
}

export async function handleCreate(req: Request, res: Response): Promise<void> {
  try {
    const candidate = await createCandidate(req.body, req.user!.userId);
    sendSuccess(res, candidate, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create candidate';
    sendError(res, 500, message);
  }
}

export async function handleUpdate(req: Request, res: Response): Promise<void> {
  try {
    const candidate = await updateCandidate(req.params.id, req.body, req.user!.userId);
    if (!candidate) {
      sendError(res, 404, 'Candidate not found');
      return;
    }
    sendSuccess(res, candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update candidate';
    sendError(res, 500, message);
  }
}

export async function handleUpdateStatus(req: Request, res: Response): Promise<void> {
  try {
    const candidate = await updateCandidateStatus(req.params.id, req.body, req.user!.userId);
    if (!candidate) {
      sendError(res, 404, 'Candidate not found');
      return;
    }
    sendSuccess(res, candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update status';
    sendError(res, 500, message);
  }
}

export async function handleAssign(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.body;
    if (!userId) {
      sendError(res, 422, 'userId is required');
      return;
    }
    const candidate = await assignCandidate(req.params.id, userId, req.user!.userId);
    if (!candidate) {
      sendError(res, 404, 'Candidate not found');
      return;
    }
    sendSuccess(res, candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign candidate';
    sendError(res, 500, message);
  }
}
