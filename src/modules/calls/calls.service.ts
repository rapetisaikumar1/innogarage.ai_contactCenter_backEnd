import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { emitToAll } from '../../lib/socket';
import { env } from '../../config/env';
import { makeOutboundCall } from '../../lib/twilio';
import { CallDTO, ListCallsInput, LiveVoiceSessionDTO, LogCallInput, UpdateCallInput } from './calls.types';

const CALL_INCLUDE = {
  candidate: { select: { id: true, fullName: true, phoneNumber: true } },
  loggedBy: { select: { id: true, name: true } },
} as const;

const VOICE_SESSION_INCLUDE = {
  candidate: { select: { id: true, fullName: true, phoneNumber: true, whatsappNumber: true } },
  assignedAgent: { select: { id: true, name: true } },
  call: { select: { id: true } },
} as const;

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
  assignedAgentId: string | null;
  claimedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  rawEndReason: string | null;
  createdAt: Date;
  candidate: { id: string; fullName: string; phoneNumber: string; whatsappNumber: string | null };
  assignedAgent: { id: string; name: string } | null;
  call: { id: string } | null;
}

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const digits = trimmed.replace(/[\s()-]/g, '');
  return digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
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
      return 'MISSED';
    default:
      return null;
  }
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
  return call as unknown as CallDTO;
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
  return call as unknown as CallDTO;
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
  return { calls: calls as unknown as CallDTO[], total };
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
  return { calls: calls as unknown as CallDTO[], total };
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
    const eligibleAgents = await getEligibleInboundAgents();
    return {
      session: toLiveVoiceSessionDTO(existingSession as unknown as VoiceSessionRecord),
      eligibleAgentIds: eligibleAgents.map((agent) => agent.id),
    };
  }

  const { candidateId, isUnknownCaller } = await findOrCreateCandidateForInboundCall(phoneNumber);

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

  emitToAll('voice:incoming:new', session);

  const eligibleAgents = await getEligibleInboundAgents();
  logger.info({ callSid: params.callSid, candidateId, eligibleAgents: eligibleAgents.length }, 'Inbound voice call prepared');
  return { session, eligibleAgentIds: eligibleAgents.map((agent) => agent.id) };
}

export async function claimIncomingVoiceSession(params: {
  sessionId: string;
  agentId: string;
  bridgedCallSid?: string;
}): Promise<LiveVoiceSessionDTO> {
  const claimed = await prisma.$transaction(async (tx) => {
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
      },
      data: {
        assignedAgentId: params.agentId,
        status: 'IN_CALL',
        claimedAt: new Date(),
        answeredAt: new Date(),
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

export async function rejectIncomingVoiceSession(sessionId: string): Promise<LiveVoiceSessionDTO | null> {
  const session = await prisma.voiceSession.findUnique({
    where: { id: sessionId },
    include: VOICE_SESSION_INCLUDE,
  });
  return session ? toLiveVoiceSessionDTO(session as unknown as VoiceSessionRecord) : null;
}

export async function markIncomingVoiceSessionMissed(sessionId: string, reason: string): Promise<LiveVoiceSessionDTO | null> {
  return finalizeVoiceSession(sessionId, 'MISSED', reason, null);
}

// ─── Voice: handle call status callback from Twilio ──────────────────────────
export async function handleVoiceStatus(params: {
  callSid: string;
  callStatus: string;
  callDuration?: string;
}): Promise<void> {
  const normalizedStatus = params.callStatus.toLowerCase();
  const duration = params.callDuration ? parseInt(params.callDuration, 10) : null;

  const session = await prisma.voiceSession.findFirst({
    where: {
      OR: [{ rootCallSid: params.callSid }, { bridgedCallSid: params.callSid }],
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

        await tx.voiceSession.update({
          where: { id: session.id },
          data: {
            status: 'IN_CALL',
            answeredAt: current.answeredAt ?? new Date(),
            ...(params.callSid !== current.rootCallSid && !current.bridgedCallSid ? { bridgedCallSid: params.callSid } : {}),
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

    const finalStatus = mapTwilioTerminalStatus(normalizedStatus);
    if (finalStatus) {
      await finalizeVoiceSession(session.id, finalStatus, normalizedStatus, duration);
      logger.info({ callSid: params.callSid, finalStatus, duration }, 'Voice session finalized from status callback');
      return;
    }
  }

  const legacyCall = await prisma.call.findFirst({ where: { providerCallId: params.callSid } });
  if (!legacyCall) {
    logger.warn({ callSid: params.callSid, callStatus: params.callStatus }, 'Voice status callback for unknown call SID');
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

  logger.info({ callSid: params.callSid, finalStatus, duration }, 'Legacy voice call status updated');
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
}): Promise<{ callSid: string }> {
  const candidate = await prisma.candidate.findUnique({ where: { id: params.candidateId } });
  if (!candidate) throw new Error('Candidate not found');

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { availability: true, voiceStatus: true },
  });
  if (!user || user.availability !== 'AVAILABLE' || user.voiceStatus !== 'IDLE') {
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
