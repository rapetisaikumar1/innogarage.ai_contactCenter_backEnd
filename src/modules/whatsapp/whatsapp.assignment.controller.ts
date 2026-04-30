import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  assignConversation,
  reassignConversation,
  unassignConversation,
  closeConversation,
  reopenConversation,
} from './whatsapp.assignment.service';
import { prisma } from '../../lib/prisma';
import { emitToUser } from '../../lib/socket';

// POST /api/whatsapp/conversations/:id/read
// No-op: badges are no longer cleared on chat open.
// They clear only when the agent sends a reply (handled in sendMessage).
export async function handleMarkConversationRead(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, { ok: true, skipped: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/conversations/:id/assign  — any authenticated user
export async function handleAssign(req: Request, res: Response, next: NextFunction) {
  try {
    const { agentId, newAgentId, departmentId } = req.body as {
      agentId?: string;
      newAgentId?: string;
      departmentId?: string | null;
    };
    const targetAgentId = agentId ?? newAgentId ?? req.user!.userId;
    const assigningAnotherUser = targetAgentId !== req.user!.userId;

    if (assigningAnotherUser && req.user!.role !== 'ADMIN' && req.user!.role !== 'MANAGER') {
      return sendError(res, 403, 'Only admins and managers can assign conversations to another mentor');
    }

    const result = await assignConversation(req.params.id, targetAgentId, {
      performedByUserId: req.user!.userId,
      departmentId: departmentId ?? null,
      notifyAssignee: assigningAnotherUser,
    });
    if (!result.ok) {
      const statusCode = result.reason === 'already_assigned' || result.reason === 'closed'
        ? 409
        : result.reason === 'invalid_agent' || result.reason === 'department_mismatch'
          ? 422
          : 404;
      return sendError(res, statusCode, result.reason);
    }
    sendSuccess(res, result.conversation);
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/conversations/:id/reassign  — admin only
export async function handleReassign(req: Request, res: Response, next: NextFunction) {
  try {
    const { newAgentId, departmentId } = req.body as { newAgentId?: string; departmentId?: string | null };
    if (!newAgentId) return sendError(res, 422, 'newAgentId is required');
    const result = await reassignConversation(req.params.id, newAgentId, req.user!.userId, {
      departmentId: departmentId ?? null,
      notifyAssignee: true,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/conversations/:id/unassign  — admin only
export async function handleUnassign(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await unassignConversation(req.params.id, req.user!.userId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/conversations/:id/close  — admin only
export async function handleClose(req: Request, res: Response, next: NextFunction) {
  try {
    await closeConversation(req.params.id, req.user!.userId);
    sendSuccess(res, { message: 'Conversation closed' });
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/conversations/:id/reopen  — admin only
export async function handleReopen(req: Request, res: Response, next: NextFunction) {
  try {
    await reopenConversation(req.params.id, req.user!.userId);
    sendSuccess(res, { message: 'Conversation reopened' });
  } catch (err) {
    next(err);
  }
}

// GET /api/whatsapp/notifications  — authenticated
export async function handleGetNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId, clearedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    sendSuccess(res, notifications);
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/notifications/:id/read  — authenticated
export async function handleMarkRead(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: { isRead: true },
    });
    sendSuccess(res, { message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/notifications/read-all  — authenticated
export async function handleMarkAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false, clearedAt: null },
      data: { isRead: true },
    });
    sendSuccess(res, { message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
}
