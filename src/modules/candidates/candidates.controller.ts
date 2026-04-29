import { Request, Response } from 'express';
import {
  listCandidates,
  getCandidateById,
  createCandidate,
  updateCandidate,
  updateCandidateStatus,
  assignCandidate,
  createTransferRequest,
  getPendingTransferRequest,
  respondToTransferRequest,
} from './candidates.service';
import { createAgentNotification } from '../../lib/agentNotifications';
import { prisma } from '../../lib/prisma';
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
    const candidate = await getCandidateById(req.params.id, req.user!.userId, req.user!.role);
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

    // Notify the newly assigned agent
    const assigner = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
    await createAgentNotification(
      userId,
      'CANDIDATE_ASSIGNED',
      'Candidate Assigned',
      `You have been assigned candidate ${candidate.fullName} by ${assigner?.name ?? 'Admin'}.`,
      { candidateId: candidate.id },
    );

    sendSuccess(res, candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign candidate';
    sendError(res, 500, message);
  }
}

// ── Transfer request handlers ─────────────────────────────────────────────────

export async function handleGetPendingTransfer(req: Request, res: Response): Promise<void> {
  try {
    const request = await getPendingTransferRequest(req.params.id);
    sendSuccess(res, request ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch transfer request';
    sendError(res, 500, message);
  }
}

export async function handleCreateTransferRequest(req: Request, res: Response): Promise<void> {
  try {
    const { toAgentId } = req.body;
    if (!toAgentId) {
      sendError(res, 422, 'toAgentId is required');
      return;
    }
    const request = await createTransferRequest(req.params.id, req.user!.userId, toAgentId);

    // Notify the target agent
    const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
    const candidateName = (request as { candidate?: { fullName: string } }).candidate?.fullName ?? 'Unknown';
    await createAgentNotification(
      toAgentId,
      'TRANSFER_REQUEST',
      'Transfer Request',
      `${requester?.name ?? 'An agent'} wants to transfer candidate ${candidateName} to you.`,
      { candidateId: req.params.id, requestId: request.id },
    );

    sendSuccess(res, request, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create transfer request';
    sendError(res, 400, message);
  }
}

export async function handleRespondToTransferRequest(req: Request, res: Response): Promise<void> {
  try {
    const { action } = req.body;
    if (action !== 'accept' && action !== 'reject') {
      sendError(res, 422, 'action must be "accept" or "reject"');
      return;
    }

    const updated = await respondToTransferRequest(req.params.requestId, req.user!.userId, action);
    const candidateName = (updated as { candidate?: { fullName: string } }).candidate?.fullName ?? 'Unknown';
    const responder = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
    const responderName = responder?.name ?? 'Agent';

    if (action === 'accept') {
      await createAgentNotification(
        updated.fromAgentId,
        'TRANSFER_ACCEPTED',
        'Transfer Accepted',
        `${responderName} accepted your transfer request for candidate ${candidateName}.`,
        { candidateId: updated.candidateId, requestId: updated.id },
      );
      await createAgentNotification(
        updated.toAgentId,
        'TRANSFER_ACCEPTED',
        'Candidate Transferred',
        `You have accepted the transfer. ${candidateName} is now assigned to you.`,
        { candidateId: updated.candidateId, requestId: updated.id },
      );

      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });

      await Promise.all(
        admins.map((admin) => createAgentNotification(
          admin.id,
          'TRANSFER_ACCEPTED',
          'Candidate Transfer Completed',
          `${candidateName} was transferred from ${updated.fromAgent.name} to ${updated.toAgent.name}.`,
          {
            candidateId: updated.candidateId,
            requestId: updated.id,
            fromAgentId: updated.fromAgentId,
            toAgentId: updated.toAgentId,
          },
        )),
      );
    } else {
      await createAgentNotification(
        updated.fromAgentId,
        'TRANSFER_REJECTED',
        'Transfer Rejected',
        `${responderName} rejected your transfer request for candidate ${candidateName}.`,
        { candidateId: updated.candidateId, requestId: updated.id },
      );
    }

    sendSuccess(res, updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to respond to transfer request';
    sendError(res, 400, message);
  }
}
