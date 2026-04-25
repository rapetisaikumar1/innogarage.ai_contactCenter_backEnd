import { prisma } from '../../lib/prisma';

export interface AgentDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  assignedConversationCount: number;
}

export interface AgentCandidateDTO {
  candidateId: string;
  fullName: string;
  whatsappNumber: string | null;
  phoneNumber: string | null;
  status: string;
  conversationStatus: string;
  assignedAt: string | null;
  lastMessageAt: string | null;
}

// ─── List all agents with availability and assigned conversation count ─────────
export async function listAgents(): Promise<AgentDTO[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: 'AGENT' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      availability: true,
      _count: {
        select: {
          assignedConversations: { where: { status: 'ASSIGNED' } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    availability: (u.availability ?? 'OFFLINE') as 'AVAILABLE' | 'BUSY' | 'OFFLINE',
    assignedConversationCount: u._count.assignedConversations,
  }));
}

// ─── Get candidates assigned to a specific agent (admin only) ─────────────────
export async function getAgentCandidates(agentId: string): Promise<AgentCandidateDTO[]> {
  const conversations = await prisma.conversation.findMany({
    where: { assignedAgentId: agentId, status: { in: ['ASSIGNED', 'CLOSED'] } },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      lastMessageAt: true,
      candidate: {
        select: {
          id: true,
          fullName: true,
          whatsappNumber: true,
          phoneNumber: true,
          status: true,
        },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
  });

  return conversations.map((conv) => ({
    candidateId: conv.candidate.id,
    fullName: conv.candidate.fullName,
    whatsappNumber: conv.candidate.whatsappNumber,
    phoneNumber: conv.candidate.phoneNumber,
    status: conv.candidate.status,
    conversationStatus: conv.status,
    assignedAt: conv.assignedAt?.toISOString() ?? null,
    lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
  }));
}

// ─── Update agent's own availability ─────────────────────────────────────────
export async function updateAgentAvailability(
  userId: string,
  availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE'
): Promise<AgentDTO> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { availability },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      availability: true,
      _count: { select: { assignedConversations: { where: { status: 'ASSIGNED' } } } },
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
    availability: (updated.availability ?? 'OFFLINE') as 'AVAILABLE' | 'BUSY' | 'OFFLINE',
    assignedConversationCount: updated._count.assignedConversations,
  };
}
