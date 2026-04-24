import { prisma } from './prisma';
import { notifyUsers } from './notifications';
import { emitToAll } from './socket';
import { logger } from './logger';

const RENOTIFY_INTERVAL_MS = 30 * 60 * 1000;       // 30 minutes
const HIGH_PRIORITY_CYCLES  = 2;                     // mark high priority after 2 cycles
const JOB_POLL_INTERVAL_MS  = 5 * 60 * 1000;        // check every 5 minutes

let jobTimer: NodeJS.Timeout | null = null;

export function startRenotificationJob(): void {
  logger.info('Re-notification job started (poll every 5 min)');
  jobTimer = setInterval(runRenotificationJob, JOB_POLL_INTERVAL_MS);
}

export function stopRenotificationJob(): void {
  if (jobTimer) {
    clearInterval(jobTimer);
    jobTimer = null;
    logger.info('Re-notification job stopped');
  }
}

async function runRenotificationJob(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RENOTIFY_INTERVAL_MS);

    // Find all UNASSIGNED conversations not notified in the last 30 minutes
    const stale = await prisma.conversation.findMany({
      where: {
        status: 'UNASSIGNED',
        OR: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { lte: cutoff } },
        ],
      },
      include: {
        candidate: { select: { id: true, fullName: true } },
      },
    });

    if (stale.length === 0) return;

    logger.info({ count: stale.length }, 'Re-notifying for stale unassigned conversations');

    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const allUserIds = allUsers.map((u) => u.id);

    for (const conv of stale) {
      try {
        const newCycleCount = conv.notificationCycleCount + 1;
        const shouldMarkHighPriority = newCycleCount >= HIGH_PRIORITY_CYCLES;

        // Update cycle count, lastNotifiedAt, and optionally high priority
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            lastNotifiedAt: new Date(),
            notificationCycleCount: newCycleCount,
            isHighPriority: shouldMarkHighPriority ? true : conv.isHighPriority,
          },
        });

        const isHighPriority = shouldMarkHighPriority || conv.isHighPriority;
        const title = isHighPriority
          ? `🔴 HIGH PRIORITY: Unassigned conversation`
          : `⏰ Reminder: Unassigned conversation`;
        const body = `${conv.candidate.fullName} is still waiting for an agent (${newCycleCount} reminder${newCycleCount > 1 ? 's' : ''})`;

        // Clear old unread notifications first so fresh ones are created
        await prisma.notification.updateMany({
          where: { conversationId: conv.id, isRead: false, clearedAt: null },
          data: { clearedAt: new Date() },
        });

        await notifyUsers({
          userIds: allUserIds,
          conversationId: conv.id,
          type: isHighPriority ? 'whatsapp:high_priority' : 'whatsapp:new_unassigned_message',
          title,
          body,
        });

        // Emit real-time update with high priority flag
        if (isHighPriority) {
          emitToAll('conversation:updated', {
            conversationId: conv.id,
            isHighPriority: true,
          });
        }

        logger.info(
          { conversationId: conv.id, cycle: newCycleCount, isHighPriority },
          'Re-notification sent'
        );
      } catch (err) {
        logger.error({ err, conversationId: conv.id }, 'Re-notification failed for conversation');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Re-notification job error');
  }
}
