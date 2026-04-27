import { prisma } from '../../lib/prisma';

export async function listAgentNotifications(userId: string) {
  return prisma.agentNotification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markAgentNotificationRead(id: string, userId: string) {
  return prisma.agentNotification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
}

export async function markAllAgentNotificationsRead(userId: string) {
  return prisma.agentNotification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
