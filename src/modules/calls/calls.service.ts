import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { emitToAll, emitToUsers } from '../../lib/socket';
import { env } from '../../config/env';
import { makeOutboundCall } from '../../lib/twilio';
import { createAgentNotification } from '../../lib/agentNotifications';
import { CallDTO, ListCallsInput, LiveVoiceSessionDTO, LogCallInput, UpdateCallInput } from './calls.types';

const CALL_INCLUDE = {
  candidate: { select: { id: true, fullName: true, phoneNumber: true } },
  loggedBy: { select: { id: true, name: true } },
  voiceSession: {
    select: {
      assignedAgentId: true,
      reservedAgentId: true,
      assignedAgent: { select: { id: true, name: true } },
      reservedAgent: { select: { id: true, name: true } },
    },
  },
} as const;

const VOICE_SESSION_INCLUDE = {
  candidate: { select: { id: true, fullName: true, phoneNumber: true, whatsappNumber: true } },
  reservedAgent: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, name: true } },
  call: { select: { id: true } },
} as const;

interface CallRecord {
  id: string;
  candidateId: string;
  loggedById: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  phoneNumber: string;
  duration: number | null;
  status: 'COMPLETED' | 'MISSED' | 'IN_CALL';
  providerCallId: string | null;
  notes: string | null;
  voiceSessionId: string | null;
  createdAt: Date;
  candidate: { id: string; fullName: string; phoneNumber: string };
  loggedBy: { id: string; name: string } | null;
  voiceSession: {
    assignedAgentId: string | null;
    reservedAgentId: string | null;
    assignedAgent: { id: string; name: string } | null;
    reservedAgent: { id: string; name: string } | null;
  } | null;
}

interface VoiceSessionRecord {
  id: string;
  candidateId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  rootCallSid: string;
  bridgedCallSid: string | null;
  fromNumber: string;
  toNumber: string;
  isUnknownCaller: boolean;
  status: 'RINGING' | 'CLAIMED' | 'IN_CALL' | 'ENDED';
  reservedAgentId: string | null;
  assignedAgentId: string | null;
  claimedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  rawEndReason: string | null;
  createdAt: Date;
  candidate: { id: string; fullName: string; phoneNumber: string; whatsappNumber: string | null };
  reservedAgent: { id: string; name: string } | null;
  assignedAgent: { id: string; name: string } | null;
  call: { id: string } | null;
}

interface CandidateOwner {
  id: string;
  name: string;
  role: 'ADMIN' | 'AGENT' | 'MANAGER';
  isActive: boolean;
  availability: 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE';
  voiceStatus: 'IDLE' | 'IN_CALL';
}

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const digits = trimmed.replace(/[\s()-]/g, '');
  return digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
}

function toCallDTO(call: CallRecord, openMissedAlertCount = 0): CallDTO {
  const owner = call.voiceSession?.assignedAgent ?? call.voiceSession?.reservedAgent ?? null;
  return {
    id: call.id,
    candidateId: call.candidateId,
    loggedById: call.loggedById,
    direction: call.direction,
    phoneNumber: call.phoneNumber,
    duration: call.duration,
    status: call.status,
    providerCallId: call.providerCallId,
    notes: call.notes,
    voiceSessionId: call.voiceSessionId,
    ownerAgentId: call.voiceSession?.assignedAgentId ?? call.voiceSession?.reservedAgentId ?? null,
    ownerAgentName: owner?.name ?? null,
    openMissedAlertCount,
    createdAt: call.createdAt,
    candidate: call.candidate,
    loggedBy: call.loggedBy,
  };
}

async function getOpenMissedAlertCounts(callIds: string[]): Promise<Map<string, number>> {
  if (callIds.length === 0) return new Map();

  const counts = await prisma.agentNotification.groupBy({
    by: ['callId'],
    where: {
      callId: { in: callIds },
      type: 'MISSED_CALL',
      clearedAt: null,
    },
    _count: { _all: true },
  });

  return new Map(
    counts
      .filter((item): item is { callId: string; _count: { _all: number } } => item.callId !== null)
      .map((item) => [item.callId, item._count._all]),
  );
}

async function toCallDTOs(calls: CallRecord[]): Promise<CallDTO[]> {
  const counts = await getOpenMissedAlertCounts(calls.map((call) => call.id));
  return calls.map((call) => toCallDTO(call, counts.get(call.id) ?? 0));
}

function toLiveVoiceSessionDTO(session: VoiceSessionRecord): LiveVoiceSessionDTO {
  return {
    id: session.id,
    callId: session.call?.id ?? null,
    candidateId: session.candidateId,
    candidateName: session.candidate.fullName,
    phoneNumber: session.direction === 'INBOUND' ? session.fromNumber : session.toNumber,
    direction: session.direction,
    status: session.status,
    reservedAgentId: session.reservedAgentId,
    reservedAgentName: session.reservedAgent?.name ?? null,
    assignedAgentId: session.assignedAgentId,
    assignedAgentName: session.assignedAgent?.name ?? null,
    isUnknownCaller: session.isUnknownCaller,
    createdAt: session.createdAt,
    claimedAt: session.claimedAt,
    answeredAt: session.answeredAt,
    endedAt: session.endedAt,
  };
}

function mapTwilioTerminalStatus(status: string): 'COMPLETED' | 'MISSED' | null {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'COMPLETED';
    case 'busy':
    case 'no-answer':
    case 'failed':
    case 'canceled':
    case 'cancelled':
    case 'rejected':
      return 'MISSED';
    default:
      return null;
  }
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function resolveFinalStatusForSession(
  session: VoiceSessionRecord,
  twilioStatus: string,
): 'COMPLETED' | 'MISSED' | null {
  const finalStatus = mapTwilioTerminalStatus(twilioStatus);
  if (!finalStatus) return null;

  if (finalStatus === 'COMPLETED' && session.status !== 'IN_CALL' && !session.answeredAt) {
    return 'MISSED';
  }

  return finalStatus;
}

async function getEligibleInboundAgents(): Promise<Array<{ id: string; name: string }>> {
  return prisma.user.findMany({
    where: {
      isActive: true,
      role: 'AGENT',
      availability: 'AVAILABLE',
      voiceStatus: 'IDLE',
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

function isEligibleVoiceOwner(owner: CandidateOwner | null): owner is CandidateOwner {
  return Boolean(
    owner &&
      owner.role === 'AGENT' &&
      owner.isActive &&
      owner.availability === 'AVAILABLE' &&
      owner.voiceStatus === 'IDLE',
  );
}

async function resolveCandidateOwner(candidateId: string): Promise<CandidateOwner | null> {
  const assignment = await prisma.candidateAssignment.findFirst({
    where: { candidateId },
    orderBy: { assignedAt: 'desc' },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          role: true,
          isActive: true,
          availability: true,
          voiceStatus: true,
        },
      },
    },
  });

  if (assignment?.user) return assignment.user;

  const conversation = await prisma.conversation.findUnique({
    where: { candidateId },
    select: {
      assignedAgent: {
        select: {
          id: true,
          name: true,
          role: true,
          isActive: true,
          availability: true,
          voiceStatus: true,
        },
      },
    },
  });

  return conversation?.assignedAgent ?? null;
}

async function getOwnerReservedRouting(candidateId: string): Promise<{
  reservedAgentId: string | null;
  eligibleAgents: Array<{ id: string; name: string }>;
}> {
  const owner = await resolveCandidateOwner(candidateId);
  if (owner) {
    return {
      reservedAgentId: owner.id,
      eligibleAgents: isEligibleVoiceOwner(owner) ? [{ id: owner.id, name: owner.name }] : [],
    };
  }

  return {
    reservedAgentId: null,
    eligibleAgents: await getEligibleInboundAgents(),
  };
}

async function getEligibleAgentsForExistingSession(session: VoiceSessionRecord): Promise<Array<{ id: string; name: string }>> {
  if (session.status !== 'RINGING') return [];
  if (!session.reservedAgentId) return getEligibleInboundAgents();

  const agent = await prisma.user.findUnique({
    where: { id: session.reservedAgentId },
    select: { id: true, name: true, role: true, isActive: true, availability: true, voiceStatus: true },
  });

  return isEligibleVoiceOwner(agent) ? [{ id: agent.id, name: agent.name }] : [];
}

async function assertOutboundCallAllowed(candidateId: string, userId: string, userRole: string): Promise<void> {
  if (userRole === 'ADMIN' || userRole === 'MANAGER') return;

  const owner = await resolveCandidateOwner(candidateId);
  if (!owner || owner.id !== userId) {
    throw new Error('Not authorised to place calls for this candidate');
  }
}

async function createMissedCallNotifications(session: LiveVoiceSessionDTO): Promise<void> {
  if (!session.callId) return;
  const callId = session.callId;

  const ownerAgentId = session.assignedAgentId ?? session.reservedAgentId;
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['ADMIN', 'MANAGER'] },
    },
    select: { id: true },
  });

  const recipientIds = [...new Set([ownerAgentId, ...admins.map((user) => user.id)].filter((id): id is string => Boolean(id)))];
  if (recipientIds.length === 0) return;

  const existing = await prisma.agentNotification.findMany({
    where: {
      callId: session.callId,
      type: 'MISSED_CALL',
      userId: { in: recipientIds },
    },
    select: { userId: true },
  });

  const alreadyNotified = new Set(existing.map((notification) => notification.userId));
  const title = 'Missed call';
  const body = `${session.candidateName} could not be connected. Review the call log and follow up.`;
  const metadata = {
    callId: session.callId,
    candidateId: session.candidateId,
    candidateName: session.candidateName,
    phoneNumber: session.phoneNumber,
    direction: session.direction,
    ownerAgentId,
  };

  await Promise.all(
    recipientIds
      .filter((recipientId) => !alreadyNotified.has(recipientId))
      .map((recipientId) => createAgentNotification(recipientId, 'MISSED_CALL', title, body, metadata, { callId })),
  );
}

async function findOrCreateCandidateForInboundCall(phoneNumber: string): Promise<{ candidateId: string; isUnknownCaller: boolean }> {
  const candidate = await prisma.candidate.findFirst({
    where: {
      OR: [{ phoneNumber }, { whatsappNumber: phoneNumber }],
    },
    select: { id: true },
  });

  if (candidate) {
    return { candidateId: candidate.id, isUnknownCaller: false };
  }

  const created = await prisma.candidate.create({
    data: {
      fullName: `Unknown Caller (${phoneNumber})`,
      phoneNumber,
      status: 'INITIAL_EVALUATION_DONE',
      source: 'Inbound Voice Call',
    },
    select: { id: true },
  });

  logger.info({ phoneNumber, candidateId: created.id }, 'Auto-created candidate from inbound voice call');
  return { candidateId: created.id, isUnknownCaller: true };
}

async function finalizeVoiceSession(
  sessionId: string,
  finalStatus: 'COMPLETED' | 'MISSED',
  reason: string,
  duration: number | null,
): Promise<LiveVoiceSessionDTO | null> {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.voiceSession.findUnique({
      where: { id: sessionId },
      include: VOICE_SESSION_INCLUDE,
    });

    if (!current) return null;
    if (current.status === 'ENDED') {
      return toLiveVoiceSessionDTO(current as unknown as VoiceSessionRecord);
    }

    await tx.voiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        rawEndReason: reason,
      },
    });

    if (current.call) {
      await tx.call.update({
        where: { id: current.call.id },
        data: {
          status: finalStatus,
          ...(duration !== null ? { duration } : {}),
        },
      });
    }

    if (current.assignedAgentId) {
      const otherActiveSessions = await tx.voiceSession.count({
        where: {
          assignedAgentId: current.assignedAgentId,
          status: { in: ['CLAIMED', 'IN_CALL'] },
          id: { not: sessionId },
        },
      });

      if (otherActiveSessions === 0) {
        await tx.user.update({
          where: { id: current.assignedAgentId },
          data: { voiceStatus: 'IDLE' },
        });
      }
    }

    const refreshed = await tx.voiceSession.findUnique({
      where: { id: sessionId },
      include: VOICE_SESSION_INCLUDE,
    });

    return refreshed ? toLiveVoiceSessionDTO(refreshed as unknown as VoiceSessionRecord) : null;
  });

  if (updated) {
    emitToAll('voice:incoming:ended', { ...updated, finalStatus });
    if (updated.assignedAgentId) {
      emitToAll('voice:presence:updated', {
        userId: updated.assignedAgentId,
        voiceStatus: 'IDLE',
      });
    }
    if (finalStatus === 'MISSED') {
      await createMissedCallNotifications(updated);
    }
  }

  return updated;
}

async function createOutboundVoiceSessionAndCall(params: {
  candidateId: string;
  userId: string;
  callSid: string;
  toNumber: string;
}): Promise<LiveVoiceSessionDTO | null> {
  const existing = await prisma.voiceSession.findUnique({
    where: { rootCallSid: params.callSid },
    include: VOICE_SESSION_INCLUDE,
  });
  if (existing) return toLiveVoiceSessionDTO(existing as unknown as VoiceSessionRecord);

  const created = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.userId },
      data: { voiceStatus: 'IN_CALL' },
    });

    const session = await tx.voiceSession.create({
      data: {
        candidateId: params.candidateId,
        direction: 'OUTBOUND',
        rootCallSid: params.callSid,
        fromNumber: normalizePhoneNumber(env.TWILIO_VOICE_NUMBER),
        toNumber: normalizePhoneNumber(params.toNumber),
        status: 'CLAIMED',
        reservedAgentId: params.userId,
        assignedAgentId: params.userId,
        claimedAt: new Date(),
      },
    });

    await tx.call.create({
      data: {
        candidateId: params.candidateId,
        loggedById: params.userId,
        direction: 'OUTBOUND',
        phoneNumber: normalizePhoneNumber(params.toNumber),
        status: 'IN_CALL',
        providerCallId: params.callSid,
        voiceSessionId: session.id,
      },
    });

    const refreshed = await tx.voiceSession.findUnique({
      where: { id: session.id },
      include: VOICE_SESSION_INCLUDE,
    });

    return refreshed ? toLiveVoiceSessionDTO(refreshed as unknown as VoiceSessionRecord) : null;
  });

  if (created) {
    emitToAll('voice:presence:updated', {
      userId: params.userId,
      voiceStatus: 'IN_CALL',
    });
  }

  return created;
}

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
  return toCallDTO(call as unknown as CallRecord);
}

// ─── Update call (add notes / fix duration after call ends) ──────────────────
export async function updateCall(
  callId: string,
  input: UpdateCallInput,
  userId: string,
  userRole: string,
): Promise<CallDTO> {
  const existing = await prisma.call.findUnique({ where: { id: callId } });
  if (!existing) throw new Error('Call not found');
  if (existing.loggedById !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
    throw new Error('Not authorised to update this call');
  }

  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: CALL_INCLUDE,
  });

  logger.info({ callId, userId }, 'Call updated');
  const counts = await getOpenMissedAlertCounts([call.id]);
  return toCallDTO(call as unknown as CallRecord, counts.get(call.id) ?? 0);
}

// ─── Delete a call log ────────────────────────────────────────────────────────
export async function deleteCall(
  callId: string,
  userId: string,
  userRole: string,
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
  limit: number,
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
  return { calls: await toCallDTOs(calls as unknown as CallRecord[]), total };
}

// ─── List all calls (dashboard) ───────────────────────────────────────────────
export async function listCalls(input: ListCallsInput): Promise<{ calls: CallDTO[]; total: number }> {
  const where = {
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.candidateId ? { candidateId: input.candidateId } : {}),
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
  return { calls: await toCallDTOs(calls as unknown as CallRecord[]), total };
}

export async function listLiveVoiceSessions(): Promise<LiveVoiceSessionDTO[]> {
  const sessions = await prisma.voiceSession.findMany({
    where: { status: { in: ['RINGING', 'CLAIMED', 'IN_CALL'] } },
    include: VOICE_SESSION_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return sessions.map((session) => toLiveVoiceSessionDTO(session as unknown as VoiceSessionRecord));
}

// ─── Voice: handle inbound call from Twilio ───────────────────────────────────
export async function handleVoiceInbound(params: {
  callSid: string;
  from: string;
  to: string;
}): Promise<{ session: LiveVoiceSessionDTO; eligibleAgentIds: string[] }> {
  const phoneNumber = normalizePhoneNumber(params.from);
  const twilioNumber = normalizePhoneNumber(params.to);

  const existingSession = await prisma.voiceSession.findUnique({
    where: { rootCallSid: params.callSid },
    include: VOICE_SESSION_INCLUDE,
  });
  if (existingSession) {
    const eligibleAgents = await getEligibleAgentsForExistingSession(existingSession as unknown as VoiceSessionRecord);
    return {
      session: toLiveVoiceSessionDTO(existingSession as unknown as VoiceSessionRecord),
      eligibleAgentIds: eligibleAgents.map((agent) => agent.id),
    };
  }

  const { candidateId, isUnknownCaller } = await findOrCreateCandidateForInboundCall(phoneNumber);
  const routing = await getOwnerReservedRouting(candidateId);

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.voiceSession.create({
      data: {
        candidateId,
        direction: 'INBOUND',
        rootCallSid: params.callSid,
        fromNumber: phoneNumber,
        toNumber: twilioNumber,
        isUnknownCaller,
        status: 'RINGING',
        reservedAgentId: routing.reservedAgentId,
      },
    });

    await tx.call.create({
      data: {
        candidateId,
        loggedById: null,
        direction: 'INBOUND',
        phoneNumber,
        status: 'IN_CALL',
        providerCallId: params.callSid,
        voiceSessionId: createdSession.id,
      },
    });

    const refreshed = await tx.voiceSession.findUnique({
      where: { id: createdSession.id },
      include: VOICE_SESSION_INCLUDE,
    });

    return refreshed ? toLiveVoiceSessionDTO(refreshed as unknown as VoiceSessionRecord) : null;
  });

  if (!session) {
    throw new Error('Failed to create inbound voice session');
  }

  if (routing.eligibleAgents.length > 0) {
    emitToUsers(routing.eligibleAgents.map((agent) => agent.id), 'voice:incoming:new', session);
  }

  logger.info({
    callSid: params.callSid,
    candidateId,
    reservedAgentId: routing.reservedAgentId,
    eligibleAgents: routing.eligibleAgents.length,
  }, 'Inbound voice call prepared');
  return { session, eligibleAgentIds: routing.eligibleAgents.map((agent) => agent.id) };
}

export async function claimIncomingVoiceSession(params: {
  sessionId: string;
  agentId: string;
  bridgedCallSid?: string;
}): Promise<LiveVoiceSessionDTO> {
  const claimed = await prisma.$transaction(async (tx) => {
    const current = await tx.voiceSession.findUnique({
      where: { id: params.sessionId },
      select: { reservedAgentId: true },
    });

    if (!current) {
      throw new Error('Voice session not found');
    }
    if (current.reservedAgentId && current.reservedAgentId !== params.agentId) {
      throw new Error('Not authorised to claim this call');
    }

    const agentUpdate = await tx.user.updateMany({
      where: {
        id: params.agentId,
        role: 'AGENT',
        isActive: true,
        availability: 'AVAILABLE',
        voiceStatus: 'IDLE',
      },
      data: { voiceStatus: 'IN_CALL' },
    });

    if (agentUpdate.count === 0) {
      throw new Error('Agent is not available to receive a new call');
    }

    const claimResult = await tx.voiceSession.updateMany({
      where: {
        id: params.sessionId,
        status: 'RINGING',
        assignedAgentId: null,
        OR: [{ reservedAgentId: null }, { reservedAgentId: params.agentId }],
      },
      data: {
        assignedAgentId: params.agentId,
        status: 'CLAIMED',
        claimedAt: new Date(),
        ...(params.bridgedCallSid ? { bridgedCallSid: params.bridgedCallSid } : {}),
      },
    });

    if (claimResult.count === 0) {
      throw new Error('Call has already been taken or is no longer available');
    }

    await tx.call.updateMany({
      where: { voiceSessionId: params.sessionId },
      data: {
        loggedById: params.agentId,
        status: 'IN_CALL',
      },
    });

    const refreshed = await tx.voiceSession.findUnique({
      where: { id: params.sessionId },
      include: VOICE_SESSION_INCLUDE,
    });

    if (!refreshed) {
      throw new Error('Voice session not found');
    }

    return toLiveVoiceSessionDTO(refreshed as unknown as VoiceSessionRecord);
  });

  emitToAll('voice:incoming:claimed', claimed);
  emitToAll('voice:presence:updated', { userId: claimed.assignedAgentId, voiceStatus: 'IN_CALL' });
  logger.info({ sessionId: params.sessionId, agentId: params.agentId }, 'Inbound voice session claimed');
  return claimed;
}

export async function rejectReservedIncomingVoiceSession(
  sessionId: string,
  agentId: string,
): Promise<LiveVoiceSessionDTO | null> {
  const session = await prisma.voiceSession.findUnique({
    where: { id: sessionId },
    include: VOICE_SESSION_INCLUDE,
  });

  if (!session) return null;

  if (session.status === 'RINGING' && session.reservedAgentId === agentId) {
    return finalizeVoiceSession(sessionId, 'MISSED', 'rejected_by_reserved_agent', null);
  }

  return toLiveVoiceSessionDTO(session as unknown as VoiceSessionRecord);
}

export async function markIncomingVoiceSessionMissed(sessionId: string, reason: string): Promise<LiveVoiceSessionDTO | null> {
  return finalizeVoiceSession(sessionId, 'MISSED', reason, null);
}

// ─── Voice: handle call status callback from Twilio ──────────────────────────
export async function handleVoiceStatus(params: {
  callSid: string;
  relatedCallSids?: string[];
  callStatus: string;
  callDuration?: string;
}): Promise<void> {
  const normalizedStatus = params.callStatus.toLowerCase();
  const duration = params.callDuration ? parseInt(params.callDuration, 10) : null;
  const callSids = uniqueValues([params.callSid, ...(params.relatedCallSids ?? [])]);

  if (callSids.length === 0) {
    logger.warn({ callStatus: params.callStatus }, 'Voice status callback missing call SID');
    return;
  }

  const session = await prisma.voiceSession.findFirst({
    where: {
      OR: [{ rootCallSid: { in: callSids } }, { bridgedCallSid: { in: callSids } }],
    },
    include: VOICE_SESSION_INCLUDE,
  });

  if (session) {
    if (normalizedStatus === 'initiated' || normalizedStatus === 'ringing') {
      return;
    }

    if (normalizedStatus === 'answered' || normalizedStatus === 'in-progress') {
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.voiceSession.findUnique({
          where: { id: session.id },
          include: VOICE_SESSION_INCLUDE,
        });

        if (!current || current.status === 'ENDED') {
          return current;
        }

        const bridgedCallSid = callSids.find((sid) => sid !== current.rootCallSid);

        await tx.voiceSession.update({
          where: { id: session.id },
          data: {
            status: 'IN_CALL',
            answeredAt: current.answeredAt ?? new Date(),
            ...(bridgedCallSid && !current.bridgedCallSid ? { bridgedCallSid } : {}),
          },
        });

        if (current.assignedAgentId) {
          await tx.user.update({
            where: { id: current.assignedAgentId },
            data: { voiceStatus: 'IN_CALL' },
          });
        }

        if (current.call) {
          await tx.call.update({
            where: { id: current.call.id },
            data: { status: 'IN_CALL' },
          });
        }

        return tx.voiceSession.findUnique({
          where: { id: session.id },
          include: VOICE_SESSION_INCLUDE,
        });
      });

      if (updated?.assignedAgentId) {
        emitToAll('voice:presence:updated', {
          userId: updated.assignedAgentId,
          voiceStatus: 'IN_CALL',
        });
      }
      return;
    }

    const finalStatus = resolveFinalStatusForSession(session as unknown as VoiceSessionRecord, normalizedStatus);
    if (finalStatus) {
      await finalizeVoiceSession(session.id, finalStatus, normalizedStatus, duration);
      logger.info({ callSids, finalStatus, duration }, 'Voice session finalized from status callback');
      return;
    }
  }

  const legacyCall = await prisma.call.findFirst({ where: { providerCallId: { in: callSids } } });
  if (!legacyCall) {
    logger.warn({ callSids, callStatus: params.callStatus }, 'Voice status callback for unknown call SID');
    return;
  }

  if (normalizedStatus === 'answered' || normalizedStatus === 'in-progress') {
    await prisma.call.update({
      where: { id: legacyCall.id },
      data: { status: 'IN_CALL' },
    });
    return;
  }

  const finalStatus = mapTwilioTerminalStatus(normalizedStatus);
  if (!finalStatus) return;

  await prisma.call.update({
    where: { id: legacyCall.id },
    data: {
      status: finalStatus,
      ...(duration !== null ? { duration } : {}),
    },
  });

  logger.info({ callSids, finalStatus, duration }, 'Legacy voice call status updated');
}

export async function registerBrowserOutboundCall(params: {
  candidateId: string;
  callSid: string;
  toNumber: string;
  userId: string;
}): Promise<LiveVoiceSessionDTO | null> {
  const candidate = await prisma.candidate.findUnique({ where: { id: params.candidateId }, select: { id: true } });
  if (!candidate) {
    logger.warn({ candidateId: params.candidateId, callSid: params.callSid }, 'Skipping browser outbound registration for unknown candidate');
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { role: true, availability: true, voiceStatus: true, isActive: true },
  });
  if (!user || !user.isActive || user.availability !== 'AVAILABLE' || user.voiceStatus !== 'IDLE') {
    throw new Error('Agent is not available to place a new call');
  }
  await assertOutboundCallAllowed(candidate.id, params.userId, user.role);

  const session = await createOutboundVoiceSessionAndCall({
    candidateId: candidate.id,
    userId: params.userId,
    callSid: params.callSid,
    toNumber: params.toNumber,
  });

  logger.info({ callSid: params.callSid, candidateId: params.candidateId, userId: params.userId }, 'Browser outbound voice call registered');
  return session;
}

// ─── Voice: initiate outbound call ───────────────────────────────────────────
export async function initiateOutboundCall(params: {
  candidateId: string;
  statusCallbackUrl: string;
  userId: string;
  userRole: string;
}): Promise<{ callSid: string }> {
  const candidate = await prisma.candidate.findUnique({ where: { id: params.candidateId } });
  if (!candidate) throw new Error('Candidate not found');

  await assertOutboundCallAllowed(params.candidateId, params.userId, params.userRole);

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { availability: true, voiceStatus: true, isActive: true },
  });
  if (!user || !user.isActive || user.availability !== 'AVAILABLE' || user.voiceStatus !== 'IDLE') {
    throw new Error('Agent is not available to place a new call');
  }

  const toNumber = candidate.phoneNumber ?? candidate.whatsappNumber;
  if (!toNumber) throw new Error('Candidate has no phone number');

  let callSid: string;
  try {
    callSid = await makeOutboundCall(toNumber, params.statusCallbackUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Twilio call failed';
    const twilioErr = new Error(msg) as Error & { statusCode: number };
    twilioErr.statusCode = 422;
    throw twilioErr;
  }

  await createOutboundVoiceSessionAndCall({
    candidateId: params.candidateId,
    userId: params.userId,
    callSid,
    toNumber,
  });

  logger.info({ callSid, candidateId: params.candidateId }, 'Outbound voice call initiated');
  return { callSid };
}
