import { prisma } from './prisma';
import { emitToUser } from './socket';

export interface AgentNotificationPayload {
  id: string;
  userId: string;
  callId: string | null;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Create a persistent agent notification and push it via socket in real time.
 */
export async function createAgentNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  options?: { callId?: string },
): Promise<AgentNotificationPayload> {
  const notification = await prisma.agentNotification.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { userId, callId: options?.callId, type, title, body, metadata: (metadata as any) ?? undefined },
  });

  const payload: AgentNotificationPayload = {
    id: notification.id,
    userId: notification.userId,
    callId: notification.callId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: notification.isRead,
    metadata: notification.metadata as Record<string, unknown> | null,
    createdAt: notification.createdAt,
  };

  // Push to the user's personal socket room
  emitToUser(userId, 'agent:notification:new', payload);

  return payload;
}
