import { Request, Response } from 'express';
import {
  listAgentNotifications,
  markAgentNotificationRead,
  markAllAgentNotificationsRead,
} from './agentNotifications.service';
import { sendSuccess, sendError } from '../../utils/response';

export async function handleList(req: Request, res: Response): Promise<void> {
  try {
    const notifications = await listAgentNotifications(req.user!.userId);
    sendSuccess(res, notifications);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
    sendError(res, 500, message);
  }
}

export async function handleMarkRead(req: Request, res: Response): Promise<void> {
  try {
    await markAgentNotificationRead(req.params.id, req.user!.userId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark notification read';
    sendError(res, 500, message);
  }
}

export async function handleMarkAllRead(req: Request, res: Response): Promise<void> {
  try {
    await markAllAgentNotificationsRead(req.user!.userId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark all notifications read';
    sendError(res, 500, message);
  }
}
