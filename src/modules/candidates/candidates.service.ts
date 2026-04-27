import { prisma } from '../../lib/prisma';
import {
  CreateCandidateInput,
  UpdateCandidateInput,
  UpdateStatusInput,
  ListCandidatesQuery,
} from './candidates.types';
import { CandidateStatus, Prisma } from '@prisma/client';

// Candidate select shape used consistently across queries
const candidateSelect = {
  id: true,
  fullName: true,
  phoneNumber: true,
  whatsappNumber: true,
  email: true,
  city: true,
  qualification: true,
  skills: true,
  experience: true,
  preferredRole: true,
  status: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    select: {
      user: { select: { id: true, name: true, email: true } },
      assignedAt: true,
    },
    orderBy: { assignedAt: 'desc' as const },
    take: 1,
  },
};

export async function listCandidates(query: ListCandidatesQuery, userId: string, userRole: string) {
  const { page, limit, search, status, assignedToMe } = query;
  const skip = (page - 1) * limit;

  // Build AND conditions so search + status + agent-scope can all coexist
  const andConditions: Prisma.CandidateWhereInput[] = [];

  if (search) {
    andConditions.push({
      OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { whatsappNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (status) {
    andConditions.push({ status });
  }

  // Agents see candidates they are explicitly assigned to (CandidateAssignment)
  // OR whose active WhatsApp conversation is assigned to them.
  // This handles auto-created WhatsApp candidates that never got a CandidateAssignment.
  if (userRole === 'AGENT' || assignedToMe) {
    andConditions.push({
      OR: [
        { assignments: { some: { userId } } },
        { conversation: { assignedAgentId: userId, status: 'ASSIGNED' } },
      ],
    });
  }

  const where: Prisma.CandidateWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  const [candidates, total] = await prisma.$transaction([
    prisma.candidate.findMany({
      where,
      select: candidateSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.candidate.count({ where }),
  ]);

  return {
    candidates,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCandidateById(id: string, userId?: string, userRole?: string) {
  // Agents may only access candidates assigned to them
  if (userRole === 'AGENT' && userId) {
    const owned = await prisma.candidate.findFirst({
      where: {
        id,
        OR: [
          { assignments: { some: { userId } } },
          { conversation: { assignedAgentId: userId } },
        ],
      },
      select: { id: true },
    });
    if (!owned) return null;
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: {
      ...candidateSelect,
      notes: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      followUps: {
        select: {
          id: true,
          dueAt: true,
          status: true,
          remarks: true,
          completedAt: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { dueAt: 'asc' },
      },
      statusHistory: {
        select: {
          id: true,
          oldStatus: true,
          newStatus: true,
          changedAt: true,
          changedBy: { select: { id: true, name: true } },
        },
        orderBy: { changedAt: 'desc' },
      },
    },
  });
  return candidate;
}

export async function createCandidate(input: CreateCandidateInput, createdByUserId: string) {
  const candidate = await prisma.candidate.create({
    data: {
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      whatsappNumber: input.whatsappNumber,
      email: input.email || null,
      city: input.city,
      qualification: input.qualification,
      skills: input.skills,
      experience: input.experience,
      preferredRole: input.preferredRole,
      source: input.source,
      status: CandidateStatus.INITIAL_EVALUATION_DONE,
      // Auto-assign to creator if they are an agent
      assignments: {
        create: {
          userId: createdByUserId,
          assignedById: createdByUserId,
        },
      },
    },
    select: candidateSelect,
  });

  await prisma.auditLog.create({
    data: {
      userId: createdByUserId,
      action: 'CREATE',
      entityType: 'Candidate',
      entityId: candidate.id,
    },
  });

  return candidate;
}

export async function updateCandidate(id: string, input: UpdateCandidateInput, userId: string) {
  const existing = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;

  const candidate = await prisma.candidate.update({
    where: { id },
    data: {
      ...input,
      email: input.email || null,
    },
    select: candidateSelect,
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'UPDATE',
      entityType: 'Candidate',
      entityId: id,
    },
  });

  return candidate;
}

export async function updateCandidateStatus(
  id: string,
  input: UpdateStatusInput,
  userId: string
) {
  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return null;

  const [candidate] = await prisma.$transaction([
    prisma.candidate.update({
      where: { id },
      data: { status: input.status },
      select: candidateSelect,
    }),
    prisma.statusHistory.create({
      data: {
        candidateId: id,
        oldStatus: existing.status,
        newStatus: input.status,
        changedById: userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: 'STATUS_CHANGE',
        entityType: 'Candidate',
        entityId: id,
        metadata: { from: existing.status, to: input.status },
      },
    }),
  ]);

  return candidate;
}

export async function assignCandidate(candidateId: string, assignToUserId: string, assignedById: string) {
  const existing = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } });
  if (!existing) return null;

  // Remove existing assignments and create new one
  await prisma.$transaction([
    prisma.candidateAssignment.deleteMany({ where: { candidateId } }),
    prisma.candidateAssignment.create({
      data: { candidateId, userId: assignToUserId, assignedById },
    }),
    prisma.auditLog.create({
      data: {
        userId: assignedById,
        action: 'ASSIGN',
        entityType: 'Candidate',
        entityId: candidateId,
        metadata: { assignedTo: assignToUserId },
      },
    }),
  ]);

  return prisma.candidate.findUnique({ where: { id: candidateId }, select: candidateSelect });
}

// ─── Transfer Request functions ───────────────────────────────────────────────

const transferRequestSelect = {
  id: true,
  candidateId: true,
  fromAgentId: true,
  toAgentId: true,
  status: true,
  createdAt: true,
  fromAgent: { select: { id: true, name: true } },
  toAgent:   { select: { id: true, name: true } },
};

export async function getPendingTransferRequest(candidateId: string) {
  return prisma.candidateTransferRequest.findFirst({
    where: { candidateId, status: 'PENDING' },
    select: transferRequestSelect,
  });
}

export async function createTransferRequest(
  candidateId: string,
  fromAgentId: string,
  toAgentId: string,
) {
  // Ensure no PENDING request already exists
  const existing = await prisma.candidateTransferRequest.findFirst({
    where: { candidateId, status: 'PENDING' },
  });
  if (existing) throw new Error('A transfer request is already pending for this candidate');

  // Verify the requesting agent is actually assigned to this candidate
  const assignment = await prisma.candidateAssignment.findFirst({
    where: { candidateId, userId: fromAgentId },
  });
  if (!assignment) throw new Error('You are not assigned to this candidate');

  const request = await prisma.candidateTransferRequest.create({
    data: { candidateId, fromAgentId, toAgentId },
    select: { ...transferRequestSelect, candidate: { select: { fullName: true } } },
  });

  return request;
}

export async function respondToTransferRequest(
  requestId: string,
  respondingAgentId: string,
  action: 'accept' | 'reject',
) {
  const request = await prisma.candidateTransferRequest.findUnique({
    where: { id: requestId },
    select: {
      ...transferRequestSelect,
      candidate: { select: { fullName: true } },
    },
  });

  if (!request) throw new Error('Transfer request not found');
  if (request.status !== 'PENDING') throw new Error('Transfer request is no longer pending');
  if (request.toAgentId !== respondingAgentId) throw new Error('You are not the target of this transfer request');

  const newStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';

  const updated = await prisma.candidateTransferRequest.update({
    where: { id: requestId },
    data: { status: newStatus },
    select: { ...transferRequestSelect, candidate: { select: { fullName: true } } },
  });

  if (action === 'accept') {
    // Look up the WhatsApp conversation for this candidate (if any).
    // If it exists, use reassignConversation — it atomically:
    //   • swaps Conversation.assignedAgentId  (so it appears in B's inbox / disappears from A's)
    //   • swaps CandidateAssignment           (so it appears in B's candidates / disappears from A's)
    //   • clears A's bell notifications for the conversation
    //   • emits 'conversation:updated' + 'conversation:removed_from_inbox' for live UI sync
    // If no conversation exists yet, fall back to a plain candidate-assignment swap.
    const conversation = await prisma.conversation.findUnique({
      where: { candidateId: request.candidateId },
      select: { id: true },
    });

    if (conversation) {
      const { reassignConversation } = await import('../whatsapp/whatsapp.assignment.service');
      await reassignConversation(conversation.id, request.toAgentId, request.toAgentId);
    } else {
      await assignCandidate(request.candidateId, request.toAgentId, request.toAgentId);
    }
  }

  return updated;
}
