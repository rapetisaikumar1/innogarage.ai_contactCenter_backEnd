import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DashboardStats } from './dashboard.types';

interface GetDashboardStatsOptions {
  userId: string;
  userRole: string;
  from?: Date;
  to?: Date;
}

function buildMentorOwnedCandidateWhere(userId: string): Prisma.CandidateWhereInput {
  return {
    OR: [
      { assignments: { some: { userId } } },
      { conversation: { assignedAgentId: userId, status: 'ASSIGNED' } },
    ],
  };
}

function buildMentorScopedCallWhere(userId: string): Prisma.CallWhereInput {
  return {
    OR: [
      { loggedById: userId },
      { candidate: buildMentorOwnedCandidateWhere(userId) },
    ],
  };
}

function buildMentorScopedMessageWhere(userId: string): Prisma.MessageWhereInput {
  return {
    channel: 'WHATSAPP',
    conversation: { assignedAgentId: userId, status: 'ASSIGNED' },
  };
}

export async function getDashboardStats({ userId, userRole, from, to }: GetDashboardStatsOptions): Promise<DashboardStats> {
  const now = new Date();
  const rangeStart = from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const rangeEnd   = to   ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const isWorkspaceDashboard = userRole === 'ADMIN' || userRole === 'MANAGER';
  const candidateWhere = isWorkspaceDashboard ? undefined : buildMentorOwnedCandidateWhere(userId);
  const followUpScope = isWorkspaceDashboard ? {} : { userId };
  const callsTodayWhere: Prisma.CallWhereInput = isWorkspaceDashboard
    ? { createdAt: { gte: rangeStart, lte: rangeEnd } }
    : { AND: [{ createdAt: { gte: rangeStart, lte: rangeEnd } }, buildMentorScopedCallWhere(userId)] };
  const recentCallsWhere = isWorkspaceDashboard ? undefined : buildMentorScopedCallWhere(userId);
  const messagesTodayWhere: Prisma.MessageWhereInput = isWorkspaceDashboard
    ? { createdAt: { gte: rangeStart, lte: rangeEnd } }
    : { AND: [{ createdAt: { gte: rangeStart, lte: rangeEnd } }, buildMentorScopedMessageWhere(userId)] };
  const recentMessagesWhere: Prisma.MessageWhereInput = isWorkspaceDashboard
    ? { channel: 'WHATSAPP' }
    : buildMentorScopedMessageWhere(userId);

  const [
    totalCandidates,
    candidatesByStatusRaw,
    todayFollowUps,
    overdueFollowUps,
    totalCallsToday,
    totalMessagesToday,
    recentCandidates,
    recentCalls,
    recentMessagesRaw,
  ] = await Promise.all([
    prisma.candidate.count({ ...(candidateWhere ? { where: candidateWhere } : {}) }),

    prisma.candidate.groupBy({
      ...(candidateWhere ? { where: candidateWhere } : {}),
      by: ['status'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    prisma.followUp.count({
      where: {
        ...followUpScope,
        status: { in: ['PENDING', 'OVERDUE'] },
        dueAt: { gte: todayStart, lte: todayEnd },
      },
    }),

    prisma.followUp.count({
      where: {
        ...followUpScope,
        status: 'OVERDUE',
      },
    }),

    prisma.call.count({
      where: callsTodayWhere,
    }),

    prisma.message.count({
      where: messagesTodayWhere,
    }),

    prisma.candidate.findMany({
      ...(candidateWhere ? { where: candidateWhere } : {}),
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, fullName: true, status: true, phoneNumber: true, createdAt: true },
    }),

    prisma.call.findMany({
      ...(recentCallsWhere ? { where: recentCallsWhere } : {}),
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        candidate: { select: { id: true, fullName: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    }),

    prisma.message.findMany({
      where: recentMessagesWhere,
      orderBy: { createdAt: 'desc' },
      distinct: ['candidateId'],
      take: 5,
      select: {
        candidateId: true,
        messageText: true,
        createdAt: true,
        direction: true,
        candidate: { select: { fullName: true } },
      },
    }),
  ]);

  const candidatesByStatus: { status: string; count: number }[] = candidatesByStatusRaw.map((r) => ({
    status: r.status,
    count: r._count.id,
  }));

  const recentMessages = recentMessagesRaw.map((m) => ({
    candidateId: m.candidateId,
    candidateName: m.candidate.fullName,
    lastMessage: m.messageText.length > 80 ? m.messageText.slice(0, 80) + '…' : m.messageText,
    lastMessageAt: m.createdAt,
    lastDirection: m.direction,
  }));

  return {
    totalCandidates,
    candidatesByStatus,
    todayFollowUps,
    overdueFollowUps,
    totalCallsToday,
    totalMessagesToday,
    recentCandidates,
    recentCalls: recentCalls as unknown as DashboardStats['recentCalls'],
    recentMessages,
  };
}
