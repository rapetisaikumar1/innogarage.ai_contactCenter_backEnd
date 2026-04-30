import { prisma } from '../../lib/prisma';
import { emitToAll, emitToUsers } from '../../lib/socket';
import { clearNotificationsForUsers } from '../../lib/notifications';
import { createAgentNotification } from '../../lib/agentNotifications';
import { logger } from '../../lib/logger';

type AssignFailureReason = 'already_assigned' | 'not_found' | 'closed' | 'invalid_agent' | 'department_mismatch';

interface AssignmentOptions {
  performedByUserId?: string;
  departmentId?: string | null;
  notifyAssignee?: boolean;
}

export type AssignResult =
  | { ok: true; conversation: ConversationView }
  | { ok: false; reason: AssignFailureReason };

export interface ConversationView {
  id: string;
  candidateId: string;
  status: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  isHighPriority: boolean;
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

async function validateAssignableAgent(agentId: string, departmentId?: string | null): Promise<AssignFailureReason | null> {
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true, isActive: true, departmentId: true },
  });

  if (!agent || agent.role !== 'MENTOR' || !agent.isActive) return 'invalid_agent';
  if (departmentId && agent.departmentId !== departmentId) return 'department_mismatch';
  return null;
}

async function notifyAssignedAgent(params: {
  agentId: string;
  performedByUserId: string;
  conversationId: string;
  candidateId: string;
  candidateName: string;
}): Promise<void> {
  if (params.agentId === params.performedByUserId) return;

  const assigner = await prisma.user.findUnique({
    where: { id: params.performedByUserId },
    select: { name: true },
  });

  await createAgentNotification(
    params.agentId,
    'CANDIDATE_ASSIGNED',
    'Candidate Assigned',
    `You have been assigned candidate ${params.candidateName} by ${assigner?.name ?? 'Admin'}.`,
    { candidateId: params.candidateId, conversationId: params.conversationId },
  );
}

// ─── Assign conversation to requesting agent (first-wins, atomic) ─────────────
export async function assignConversation(
  conversationId: string,
  agentId: string,
  options: AssignmentOptions = {}
): Promise<AssignResult> {
  let result: AssignResult = { ok: false, reason: 'not_found' };
  const performedByUserId = options.performedByUserId ?? agentId;

  // Read current state first
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });

  if (!conv) return { ok: false, reason: 'not_found' };
  if (conv.status === 'CLOSED') return { ok: false, reason: 'closed' };
  if (conv.status === 'ASSIGNED') return { ok: false, reason: 'already_assigned' };

  const validationError = await validateAssignableAgent(agentId, options.departmentId);
  if (validationError) return { ok: false, reason: validationError };

  // Atomic update: only succeeds if status is still UNASSIGNED
  // Uses updateMany with a where-guard — 0 rows updated = someone else got it first
  const updateResult = await prisma.conversation.updateMany({
    where: { id: conversationId, status: 'UNASSIGNED' },
    data: {
      status: 'ASSIGNED',
      assignedAgentId: agentId,
      assignedAt: new Date(),
      isHighPriority: false,
      notificationCycleCount: 0,
    },
  });

  if (updateResult.count === 0) {
    // Race condition — another agent assigned it first
    return { ok: false, reason: 'already_assigned' };
  }

  const updated = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      assignedAgent: { select: { id: true, name: true } },
      candidate: { select: { id: true, fullName: true } },
    },
  });

  await prisma.$transaction([
    prisma.conversationAssignmentLog.create({
      data: {
        conversationId,
        action: 'ASSIGNED',
        performedByUserId,
        newAgentId: agentId,
      },
    }),
    prisma.candidateAssignment.deleteMany({
      where: { candidateId: updated!.candidateId },
    }),
    prisma.candidateAssignment.create({
      data: { candidateId: updated!.candidateId, userId: agentId, assignedById: performedByUserId },
    }),
  ]);

  result = {
    ok: true,
    conversation: {
      id: updated!.id,
      candidateId: updated!.candidateId,
      status: updated!.status,
      assignedAgentId: updated!.assignedAgentId,
      assignedAgentName: updated!.assignedAgent?.name ?? null,
      isHighPriority: updated!.isHighPriority,
    },
  };

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
    status: 'ASSIGNED',
    assignedAgentId: agentId,
    assignedAgentName: conversation.assignedAgentName,
    isHighPriority: false,
  });

  // ── Emit: remove from inbox for everyone except assigned agent + admins ───
  emitToUsers(otherUserIds, 'conversation:removed_from_inbox', { conversationId });

  if (options.notifyAssignee && updated?.candidate) {
    await notifyAssignedAgent({
      agentId,
      performedByUserId,
      conversationId,
      candidateId: updated.candidate.id,
      candidateName: updated.candidate.fullName,
    });
  }

  logger.info({ conversationId, agentId, performedByUserId }, 'Conversation assigned');
  return result;
}

// ─── Reassign (admin only) ────────────────────────────────────────────────────
export async function reassignConversation(
  conversationId: string,
  newAgentId: string,
  performedByUserId: string,
  options: Pick<AssignmentOptions, 'departmentId' | 'notifyAssignee'> = {}
): Promise<ConversationView> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('Conversation not found');
  if (conv.status === 'CLOSED') throw new Error('Cannot reassign a closed conversation');

  const validationError = await validateAssignableAgent(newAgentId, options.departmentId);
  if (validationError === 'invalid_agent') throw httpError('Selected mentor is not available', 422);
  if (validationError === 'department_mismatch') throw httpError('Selected mentor does not belong to the selected department', 422);

  const previousAgentId = conv.assignedAgentId;

  // Atomic: update conversation + log + swap CandidateAssignment in a transaction
  const updated = await prisma.$transaction(async (tx) => {
    const updatedConv = await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'ASSIGNED',
        assignedAgentId: newAgentId,
        assignedAt: new Date(),
      },
      include: {
        assignedAgent: { select: { id: true, name: true } },
        candidate: { select: { id: true, fullName: true } },
      },
    });

    await tx.conversationAssignmentLog.create({
      data: {
        conversationId,
        action: 'REASSIGNED',
        performedByUserId,
        previousAgentId,
        newAgentId,
      },
    });

    await tx.candidateAssignment.deleteMany({
      where: { candidateId: updatedConv.candidateId },
    });
    await tx.candidateAssignment.create({
      data: {
        candidateId: updatedConv.candidateId,
        userId: newAgentId,
        assignedById: performedByUserId,
      },
    });

    return updatedConv;
  });

  // Notify old agent their conversation was reassigned
  if (previousAgentId && previousAgentId !== newAgentId) {
    // Clear previous agent's bell notifications for this conversation
    await clearNotificationsForUsers(conversationId, [previousAgentId]);
    emitToUsers([previousAgentId], 'notifications:cleared', { conversationId });
    emitToUsers([previousAgentId], 'conversation:removed_from_inbox', { conversationId });
  }

  emitToAll('conversation:updated', {
    conversationId,
    status: 'ASSIGNED',
    assignedAgentId: newAgentId,
    assignedAgentName: updated.assignedAgent?.name ?? null,
  });

  if (options.notifyAssignee) {
    await notifyAssignedAgent({
      agentId: newAgentId,
      performedByUserId,
      conversationId,
      candidateId: updated.candidate.id,
      candidateName: updated.candidate.fullName,
    });
  }

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
