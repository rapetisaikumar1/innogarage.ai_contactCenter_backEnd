import { prisma } from '../../lib/prisma';
import { DashboardStats } from './dashboard.types';

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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
    // Total candidates
    prisma.candidate.count(),

    // Group by status
    prisma.candidate.groupBy({
      by: ['status'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    // Follow-ups due today (PENDING or OVERDUE, dueAt within today)
    prisma.followUp.count({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueAt: { gte: todayStart, lte: todayEnd },
      },
    }),

    // All overdue follow-ups
    prisma.followUp.count({
      where: {
        status: 'OVERDUE',
      },
    }),

    // Calls logged today
    prisma.call.count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    }),

    // WhatsApp messages today
    prisma.message.count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    }),

    // 5 most recently added candidates
    prisma.candidate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, fullName: true, status: true, phoneNumber: true, createdAt: true },
    }),

    // 5 most recent call logs
    prisma.call.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        candidate: { select: { id: true, fullName: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    }),

    // Latest message per candidate (inbox snapshot)
    prisma.message.findMany({
      where: { channel: 'WHATSAPP' },
      orderBy: { createdAt: 'desc' },
      distinct: ['candidateId'],
      take: 5,
      include: {
        candidate: { select: { id: true, fullName: true } },
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
