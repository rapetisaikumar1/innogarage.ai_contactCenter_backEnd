import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { CallDTO, ListCallsInput, LogCallInput, UpdateCallInput } from './calls.types';

const CALL_INCLUDE = {
  candidate: { select: { id: true, fullName: true, phoneNumber: true } },
  loggedBy: { select: { id: true, name: true } },
} as const;

// ─── Log a new call ───────────────────────────────────────────────────────────
export async function logCall(input: LogCallInput, userId: string): Promise<CallDTO> {
  const candidate = await prisma.candidate.findUnique({ where: { id: input.candidateId } });
  if (!candidate) throw new Error('Candidate not found');

  const call = await prisma.call.create({
    data: {
      candidateId: input.candidateId,
      loggedById: userId,
      direction: input.direction,
      phoneNumber: input.phoneNumber,
      duration: input.duration ?? null,
      status: input.status,
      notes: input.notes ?? null,
    },
    include: CALL_INCLUDE,
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CALL_LOGGED',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        candidateId: input.candidateId,
        direction: input.direction,
        status: input.status,
        duration: input.duration,
      },
    },
  });

  logger.info({ callId: call.id, candidateId: input.candidateId }, 'Call logged');
  return call as unknown as CallDTO;
}

// ─── Update call (add notes / fix duration after call ends) ──────────────────
export async function updateCall(
  callId: string,
  input: UpdateCallInput,
  userId: string,
  userRole: string
): Promise<CallDTO> {
  const existing = await prisma.call.findUnique({ where: { id: callId } });
  if (!existing) throw new Error('Call not found');
  if (existing.loggedById !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
    throw new Error('Not authorised to update this call');
  }

  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      ...(input.duration !== undefined && { duration: input.duration }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: CALL_INCLUDE,
  });

  logger.info({ callId, userId }, 'Call updated');
  return call as unknown as CallDTO;
}

// ─── Delete a call log ────────────────────────────────────────────────────────
export async function deleteCall(
  callId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const existing = await prisma.call.findUnique({ where: { id: callId } });
  if (!existing) throw new Error('Call not found');
  if (existing.loggedById !== userId && userRole !== 'ADMIN') {
    throw new Error('Not authorised to delete this call');
  }
  await prisma.call.delete({ where: { id: callId } });
  logger.info({ callId, userId }, 'Call deleted');
}

// ─── List calls for a single candidate ───────────────────────────────────────
export async function listCallsByCandidate(
  candidateId: string,
  page: number,
  limit: number
): Promise<{ calls: CallDTO[]; total: number }> {
  const [calls, total] = await Promise.all([
    prisma.call.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: CALL_INCLUDE,
    }),
    prisma.call.count({ where: { candidateId } }),
  ]);
  return { calls: calls as unknown as CallDTO[], total };
}

// ─── List all calls (dashboard) ───────────────────────────────────────────────
export async function listCalls(input: ListCallsInput): Promise<{ calls: CallDTO[]; total: number }> {
  const where = {
    ...(input.direction && { direction: input.direction }),
    ...(input.status && { status: input.status }),
    ...(input.candidateId && { candidateId: input.candidateId }),
  };

  const [calls, total] = await Promise.all([
    prisma.call.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: CALL_INCLUDE,
    }),
    prisma.call.count({ where }),
  ]);
  return { calls: calls as unknown as CallDTO[], total };
}
