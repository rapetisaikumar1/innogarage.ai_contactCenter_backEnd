import { z } from 'zod';

// Schema for agent sending an outbound message
export const sendMessageSchema = z.object({
  candidateId: z.string().min(1, 'candidateId is required'),
  message: z.string().min(1, 'Message is required').max(1600, 'Message too long'),
});

// Schema for listing messages (inbox / candidate thread)
export const listMessagesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export interface MessageDTO {
  id: string;
  candidateId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: 'WHATSAPP';
  messageText: string;
  externalMessageId: string | null;
  sentByUserId: string | null;
  createdAt: Date;
  candidate: { id: string; fullName: string; phoneNumber: string; whatsappNumber: string | null };
  sentBy: { id: string; name: string } | null;
}

export interface ConversationSummary {
  candidateId: string;
  conversationId: string;
  candidateName: string;
  whatsappNumber: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  lastDirection: 'INBOUND' | 'OUTBOUND';
  unreadCount: number;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'CLOSED';
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  isHighPriority: boolean;
}
