import { prisma } from '../../lib/prisma';
import {
  CreateFollowUpInput,
  UpdateFollowUpInput,
  ListFollowUpsQuery,
} from './followups.types';
import { FollowUpStatus, Prisma } from '@prisma/client';

const followUpSelect = {
  id: true,
  dueAt: true,
  status: true,
  remarks: true,
  completedAt: true,
  createdAt: true,
  candidateId: true,
  candidate: { select: { id: true, fullName: true, phoneNumber: true } },
  user: { select: { id: true, name: true } },
};

export async function listFollowUpsByCandidate(candidateId: string) {
  return prisma.followUp.findMany({
    where: { candidateId },
    select: followUpSelect,
    orderBy: { dueAt: 'asc' },
  });
}

export async function listFollowUps(query: ListFollowUpsQuery, userId: string, userRole: string) {
  const { page, limit, status, overdue } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.FollowUpWhereInput = {};

  // Agents only see their own follow-ups
  if (userRole === 'MENTOR') {
    where.userId = userId;
  }

  if (status) {
    where.status = status;
  }

  if (overdue) {
    where.status = FollowUpStatus.PENDING;
    where.dueAt = { lt: new Date() };
  }

  const [followUps, total] = await prisma.$transaction([
    prisma.followUp.findMany({
      where,
      select: followUpSelect,
      orderBy: { dueAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.followUp.count({ where }),
  ]);

  return {
    followUps,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function createFollowUp(
  candidateId: string,
  userId: string,
  input: CreateFollowUpInput
) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) return null;

  const followUp = await prisma.followUp.create({
    data: {
      candidateId,
      userId,
      dueAt: new Date(input.dueAt),
      remarks: input.remarks,
      status: FollowUpStatus.PENDING,
    },
    select: followUpSelect,
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CREATE',
      entityType: 'FollowUp',
      entityId: followUp.id,
      metadata: { candidateId, dueAt: input.dueAt },
    },
  });

  return followUp;
}

export async function updateFollowUp(
  followUpId: string,
  userId: string,
  input: UpdateFollowUpInput
) {
  const existing = await prisma.followUp.findUnique({
    where: { id: followUpId },
    select: { id: true },
  });
  if (!existing) return null;

  const completedAt =
    input.status === FollowUpStatus.COMPLETED ? new Date() : undefined;

  const followUp = await prisma.followUp.update({
    where: { id: followUpId },
    data: {
      status: input.status,
      remarks: input.remarks,
      ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      ...(completedAt ? { completedAt } : {}),
    },
    select: followUpSelect,
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'UPDATE',
      entityType: 'FollowUp',
      entityId: followUpId,
      metadata: { status: input.status },
    },
  });

  return followUp;
}

// Mark all PENDING follow-ups past their dueAt as OVERDUE
export async function markOverdueFollowUps(): Promise<number> {
  const result = await prisma.followUp.updateMany({
    where: {
      status: FollowUpStatus.PENDING,
      dueAt: { lt: new Date() },
    },
    data: { status: FollowUpStatus.OVERDUE },
  });
  return result.count;
}
