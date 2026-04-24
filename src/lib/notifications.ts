import { prisma } from './prisma';
import { emitToUsers } from './socket';
import { logger } from './logger';

/**
 * Create notifications for a list of users and emit via socket in one call.
 * Skips users who already have an unread notification for this conversation.
 */
export async function notifyUsers(params: {
  userIds: string[];
  conversationId: string;
  type: string;
  title: string;
  body: string;
}): Promise<void> {
  const { userIds, conversationId, type, title, body } = params;
  if (userIds.length === 0) return;

  // Bulk-upsert: skip if unread notification already exists for this user+conversation
  const existing = await prisma.notification.findMany({
    where: { conversationId, userId: { in: userIds }, isRead: false, clearedAt: null },
    select: { userId: true },
  });
  const alreadyNotified = new Set(existing.map((n) => n.userId));
  const toNotify = userIds.filter((id) => !alreadyNotified.has(id));

  if (toNotify.length === 0) return;

  await prisma.notification.createMany({
    data: toNotify.map((userId) => ({ userId, conversationId, type, title, body })),
  });

  const notifications = await prisma.notification.findMany({
    where: { conversationId, userId: { in: toNotify }, clearedAt: null, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: toNotify.length,
  });

  // Emit per-user so each socket room gets only their own notification
  for (const notif of notifications) {
    emitToUsers([notif.userId], 'notification:new', {
      id: notif.id,
      conversationId: notif.conversationId,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      createdAt: notif.createdAt,
    });
  }

  logger.info({ conversationId, count: toNotify.length }, 'Notifications sent');
}

/**
 * Clear (soft-delete) all unread notifications for a conversation for given users.
 * Called when a conversation is assigned — clears other agents' notifications.
 */
export async function clearNotificationsForUsers(
  conversationId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.updateMany({
    where: { conversationId, userId: { in: userIds }, clearedAt: null },
    data: { clearedAt: new Date() },
  });
}
