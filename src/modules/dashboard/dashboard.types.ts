import { z } from 'zod';

export interface CandidateStatusCount {
  status: string;
  count: number;
}

export interface DashboardStats {
  totalCandidates: number;
  candidatesByStatus: CandidateStatusCount[];
  todayFollowUps: number;
  overdueFollowUps: number;
  totalCallsToday: number;
  totalMessagesToday: number;
  recentCandidates: {
    id: string;
    fullName: string;
    status: string;
    phoneNumber: string;
    createdAt: Date;
  }[];
  recentCalls: {
    id: string;
    direction: string;
    status: string;
    duration: number | null;
    createdAt: Date;
    candidate: { id: string; fullName: string };
    loggedBy: { id: string; name: string };
  }[];
  recentMessages: {
    candidateId: string;
    candidateName: string;
    lastMessage: string;
    lastMessageAt: Date;
    lastDirection: string;
  }[];
}

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
