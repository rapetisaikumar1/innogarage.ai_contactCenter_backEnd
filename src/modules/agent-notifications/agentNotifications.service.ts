import { prisma } from '../../lib/prisma';
import { emitToUsers } from '../../lib/socket';

export async function listAgentNotifications(userId: string) {
  return prisma.agentNotification.findMany({
    where: { userId, clearedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markAgentNotificationRead(id: string, userId: string) {
  return prisma.agentNotification.updateMany({
    where: { id, userId, clearedAt: null },
    data: { isRead: true },
  });
}

export async function markAllAgentNotificationsRead(userId: string) {
  return prisma.agentNotification.updateMany({
    where: { userId, isRead: false, clearedAt: null },
    data: { isRead: true },
  });
}

export async function clearAgentNotificationsForCall(callId: string, userId: string, userRole: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      voiceSession: {
        select: { assignedAgentId: true, reservedAgentId: true },
      },
    },
  });

  if (!call) throw new Error('Call not found');

  const ownerAgentId = call.voiceSession?.assignedAgentId ?? call.voiceSession?.reservedAgentId ?? call.loggedById;
  const canClear = userRole === 'ADMIN' || userRole === 'MANAGER' || ownerAgentId === userId;
  if (!canClear) throw new Error('Not authorised to clear alerts for this call');

  const notifications = await prisma.agentNotification.findMany({
    where: { callId, type: 'MISSED_CALL', clearedAt: null },
    select: { userId: true },
  });

  if (notifications.length === 0) return { cleared: 0 };

  const affectedUserIds = [...new Set(notifications.map((notification) => notification.userId))];

  const result = await prisma.agentNotification.updateMany({
    where: { callId, type: 'MISSED_CALL', clearedAt: null },
    data: { clearedAt: new Date(), isRead: true },
  });

  emitToUsers(affectedUserIds, 'agent:notifications:cleared', { callId });

  return { cleared: result.count };
}
