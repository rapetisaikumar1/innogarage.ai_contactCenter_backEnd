import { Request, Response } from 'express';
import {
  listFollowUpsByCandidate,
  listFollowUps,
  createFollowUp,
  updateFollowUp,
} from './followups.service';
import { sendSuccess, sendError } from '../../utils/response';
import { listFollowUpsSchema } from './followups.types';

// GET /api/candidates/:candidateId/follow-ups
export async function handleListByCandidate(req: Request, res: Response): Promise<void> {
  try {
    const followUps = await listFollowUpsByCandidate(req.params.candidateId);
    sendSuccess(res, followUps);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to fetch follow-ups');
  }
}

// GET /api/follow-ups  — dashboard view (all follow-ups for user/team)
export async function handleList(req: Request, res: Response): Promise<void> {
  try {
    const query = listFollowUpsSchema.parse(req.query);
    const result = await listFollowUps(query, req.user!.userId, req.user!.role);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to fetch follow-ups');
  }
}

// POST /api/candidates/:candidateId/follow-ups
export async function handleCreate(req: Request, res: Response): Promise<void> {
  try {
    const followUp = await createFollowUp(
      req.params.candidateId,
      req.user!.userId,
      req.body
    );
    if (!followUp) {
      sendError(res, 404, 'Candidate not found');
      return;
    }
    sendSuccess(res, followUp, 201);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to create follow-up');
  }
}

// PATCH /api/follow-ups/:followUpId
export async function handleUpdate(req: Request, res: Response): Promise<void> {
  try {
    const followUp = await updateFollowUp(req.params.followUpId, req.user!.userId, req.body);
    if (!followUp) {
      sendError(res, 404, 'Follow-up not found');
      return;
    }
    sendSuccess(res, followUp);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to update follow-up');
  }
}
