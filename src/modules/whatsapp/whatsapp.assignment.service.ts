import { prisma } from '../../lib/prisma';
import { emitToAll, emitToUsers } from '../../lib/socket';
import { clearNotificationsForUsers } from '../../lib/notifications';
import { logger } from '../../lib/logger';

export type AssignResult =
  | { ok: true; conversation: ConversationView }
  | { ok: false; reason: 'already_assigned' | 'not_found' | 'closed' };

export interface ConversationView {
  id: string;
  candidateId: string;
  status: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  isHighPriority: boolean;
}

// ─── Assign conversation to requesting agent (first-wins, atomic) ─────────────
export async function assignConversation(
  conversationId: string,
  agentId: string
): Promise<AssignResult> {
  let result: AssignResult = { ok: false, reason: 'not_found' };

  await prisma.$transaction(async (tx) => {
    // Lock the row for update to prevent race conditions
    const conv = await tx.$queryRaw<{ id: string; status: string; assigned_agent_id: string | null }[]>`
      SELECT id, status, assigned_agent_id
      FROM conversations
      WHERE id = ${conversationId}
      FOR UPDATE
    `;

    if (!conv.length) {
      result = { ok: false, reason: 'not_found' };
      return;
    }

    const current = conv[0];

    if (current.status === 'CLOSED') {
      result = { ok: false, reason: 'closed' };
      return;
    }

    if (current.status === 'ASSIGNED') {
      result = { ok: false, reason: 'already_assigned' };
      return;
    }

    // Assign it
    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'ASSIGNED',
        assignedAgentId: agentId,
        assignedAt: new Date(),
        isHighPriority: false,
        notificationCycleCount: 0,
      },
      include: {
        assignedAgent: { select: { id: true, name: true } },
        candidate: { select: { id: true, fullName: true } },
      },
    });

    // Audit log
    await tx.conversationAssignmentLog.create({
      data: {
        conversationId,
        action: 'ASSIGNED',
        performedByUserId: agentId,
        newAgentId: agentId,
      },
    });

    result = {
      ok: true,
      conversation: {
        id: updated.id,
        candidateId: updated.candidateId,
        status: updated.status,
        assignedAgentId: updated.assignedAgentId,
        assignedAgentName: updated.assignedAgent?.name ?? null,
        isHighPriority: updated.isHighPriority,
      },
    };
  });

  if (!result.ok) return result;

  const { conversation } = result as { ok: true; conversation: ConversationView };

  // ── Post-transaction: clear notifications for all other users ─────────────
  const allUsers = await prisma.user.findMany({
    where: { isActive: true, id: { not: agentId } },
    select: { id: true },
  });
  const otherUserIds = allUsers.map((u) => u.id);
  await clearNotificationsForUsers(conversationId, otherUserIds);

  // ── Emit: conversation assigned to ALL connected clients ──────────────────
  emitToAll('conversation:assigned', {
    conversationId,
    candidateId: conversation.candidateId,
    assignedAgentId: agentId,
    assignedAgentName: conversation.assignedAgentName,
  });

  // ── Emit: remove from inbox for everyone except assigned agent + admins ───
  emitToUsers(otherUserIds, 'conversation:removed_from_inbox', { conversationId });

  logger.info({ conversationId, agentId }, 'Conversation assigned');
  return result;
}

// ─── Reassign (admin only) ────────────────────────────────────────────────────
export async function reassignConversation(
  conversationId: string,
  newAgentId: string,
  performedByUserId: string
): Promise<ConversationView> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('Conversation not found');
  if (conv.status === 'CLOSED') throw new Error('Cannot reassign a closed conversation');

  const previousAgentId = conv.assignedAgentId;

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'ASSIGNED',
      assignedAgentId: newAgentId,
      assignedAt: new Date(),
    },
    include: { assignedAgent: { select: { id: true, name: true } } },
  });

  await prisma.conversationAssignmentLog.create({
    data: {
      conversationId,
      action: 'REASSIGNED',
      performedByUserId,
      previousAgentId,
      newAgentId,
    },
  });

  // Notify old agent their conversation was reassigned
  if (previousAgentId && previousAgentId !== newAgentId) {
    emitToUsers([previousAgentId], 'conversation:removed_from_inbox', { conversationId });
  }

  emitToAll('conversation:updated', {
    conversationId,
    status: 'ASSIGNED',
    assignedAgentId: newAgentId,
    assignedAgentName: updated.assignedAgent?.name ?? null,
  });

  return {
    id: updated.id,
    candidateId: updated.candidateId,
    status: updated.status,
    assignedAgentId: updated.assignedAgentId,
    assignedAgentName: updated.assignedAgent?.name ?? null,
    isHighPriority: updated.isHighPriority,
  };
}

// ─── Unassign (admin only) ────────────────────────────────────────────────────
export async function unassignConversation(
  conversationId: string,
  performedByUserId: string
): Promise<ConversationView> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('Conversation not found');

  const previousAgentId = conv.assignedAgentId;

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'UNASSIGNED', assignedAgentId: null, assignedAt: null },
  });

  await prisma.conversationAssignmentLog.create({
    data: {
      conversationId,
      action: 'UNASSIGNED',
      performedByUserId,
      previousAgentId,
    },
  });

  if (previousAgentId) {
    emitToUsers([previousAgentId], 'conversation:removed_from_inbox', { conversationId });
  }

  emitToAll('conversation:updated', {
    conversationId,
    status: 'UNASSIGNED',
    assignedAgentId: null,
    assignedAgentName: null,
  });

  return {
    id: updated.id,
    candidateId: updated.candidateId,
    status: updated.status,
    assignedAgentId: null,
    assignedAgentName: null,
    isHighPriority: updated.isHighPriority,
  };
}

// ─── Close / Reopen (admin only) ─────────────────────────────────────────────
export async function closeConversation(
  conversationId: string,
  performedByUserId: string
): Promise<void> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('Conversation not found');

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'CLOSED' },
  });

  await prisma.conversationAssignmentLog.create({
    data: { conversationId, action: 'CLOSED', performedByUserId },
  });

  emitToAll('conversation:updated', { conversationId, status: 'CLOSED' });
}

export async function reopenConversation(
  conversationId: string,
  performedByUserId: string
): Promise<void> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('Conversation not found');

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'UNASSIGNED', assignedAgentId: null, assignedAt: null },
  });

  await prisma.conversationAssignmentLog.create({
    data: { conversationId, action: 'REOPENED', performedByUserId },
  });

  emitToAll('conversation:updated', { conversationId, status: 'UNASSIGNED' });
}
