import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { listAgents, getAgentCandidates, updateAgentAvailability } from './agents.service';

// GET /api/agents  — all authenticated users can see agents list
export async function handleListAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const agents = await listAgents();
    sendSuccess(res, agents);
  } catch (err) {
    next(err);
  }
}

// GET /api/agents/:agentId/candidates  — admin/manager only
export async function handleGetAgentCandidates(req: Request, res: Response, next: NextFunction) {
  try {
    const { agentId } = req.params;
    const candidates = await getAgentCandidates(agentId);
    sendSuccess(res, candidates);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/agents/availability  — agent updates their own availability
export async function handleUpdateAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { availability } = req.body as { availability?: string };
    const allowed = ['AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE'];
    if (!availability || !allowed.includes(availability)) {
      return sendError(res, 422, `availability must be one of: ${allowed.join(', ')}`);
    }
    const agent = await updateAgentAvailability(req.user!.userId, availability as 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE');
    sendSuccess(res, agent);
  } catch (err) {
    next(err);
  }
}
