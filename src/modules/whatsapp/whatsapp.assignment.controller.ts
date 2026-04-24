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
// Agent opens chat → clears notifications for agent + all admins/managers.
// Admin/Manager opens chat → no-op (they wait for agent to respond).
export async function handleMarkConversationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Admins & Managers: do not clear on chat open
    if (role !== 'AGENT') {
      return sendSuccess(res, { ok: true, skipped: true });
    }

    // Find all admins/managers to also clear their notifications
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'MANAGER'] } },
      select: { id: true },
    });
    const adminIds = admins.map((a) => a.id);
    const allUserIds = [...new Set([userId, ...adminIds])];

    // Clear for everyone at once
    await prisma.notification.updateMany({
      where: { conversationId, userId: { in: allUserIds }, isRead: false, clearedAt: null },
      data: { isRead: true },
    });

    // Notify each user via socket so their badges update immediately
    for (const uid of allUserIds) {
      emitToUser(uid, 'notifications:cleared', { conversationId });
    }

    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/conversations/:id/assign  — any authenticated user
export async function handleAssign(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await assignConversation(req.params.id, req.user!.userId);
    if (!result.ok) {
      const statusCode = result.reason === 'already_assigned' ? 409 : 404;
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
    const { newAgentId } = req.body as { newAgentId?: string };
    if (!newAgentId) return sendError(res, 422, 'newAgentId is required');
    const result = await reassignConversation(req.params.id, newAgentId, req.user!.userId);
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
