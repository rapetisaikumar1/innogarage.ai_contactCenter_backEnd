import { prisma } from '../../lib/prisma';
import { sendWhatsAppMessage } from '../../lib/twilio';
import { logger } from '../../lib/logger';
import { SendMessageInput, ConversationSummary, MessageDTO } from './whatsapp.types';

// ─── Inbound webhook handler ──────────────────────────────────────────────────
// Called when Twilio delivers an incoming WhatsApp message from a candidate.
export async function handleInboundMessage(params: {
  from: string;       // whatsapp:+91XXXXXXXXXX
  body: string;
  messageSid: string;
}): Promise<void> {
  // Strip "whatsapp:" prefix to get bare number
  const phoneNumber = params.from.replace(/^whatsapp:/, '');

  // Find candidate by whatsapp number OR phone number
  const candidate = await prisma.candidate.findFirst({
    where: {
      OR: [
        { whatsappNumber: phoneNumber },
        { phoneNumber },
      ],
    },
  });

  let resolvedCandidate = candidate;

  // Auto-create candidate if number is unknown
  if (!resolvedCandidate) {
    resolvedCandidate = await prisma.candidate.create({
      data: {
        fullName: `Unknown (${phoneNumber})`,
        phoneNumber,
        whatsappNumber: phoneNumber,
        status: 'NEW',
      },
    });
    logger.info({ phoneNumber, candidateId: resolvedCandidate.id }, 'Auto-created candidate from unknown WhatsApp number');
  }

  // Avoid duplicate webhook deliveries
  const existing = await prisma.message.findUnique({
    where: { externalMessageId: params.messageSid },
  });
  if (existing) return;

  await prisma.message.create({
    data: {
      candidateId: resolvedCandidate.id,
      direction: 'INBOUND',
      channel: 'WHATSAPP',
      messageText: params.body,
      externalMessageId: params.messageSid,
    },
  });

  logger.info({ candidateId: resolvedCandidate.id, messageSid: params.messageSid }, 'Inbound WhatsApp stored');
}

// ─── Outbound: agent sends a message ─────────────────────────────────────────
export async function sendMessage(
  input: SendMessageInput,
  sentByUserId: string
): Promise<MessageDTO> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: input.candidateId },
  });
  if (!candidate) throw new Error('Candidate not found');

  const toNumber = candidate.whatsappNumber ?? candidate.phoneNumber;
  if (!toNumber) throw new Error('Candidate has no phone/WhatsApp number');

  const messageSid = await sendWhatsAppMessage(toNumber, input.message);

  const message = await prisma.message.create({
    data: {
      candidateId: input.candidateId,
      direction: 'OUTBOUND',
      channel: 'WHATSAPP',
      messageText: input.message,
      externalMessageId: messageSid,
      sentByUserId,
    },
    include: {
      candidate: { select: { id: true, fullName: true, phoneNumber: true, whatsappNumber: true } },
      sentBy: { select: { id: true, name: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: sentByUserId,
      action: 'WHATSAPP_SENT',
      entityType: 'Message',
      entityId: message.id,
      metadata: { candidateId: input.candidateId, messageSid },
    },
  });

  logger.info({ messageId: message.id, candidateId: input.candidateId }, 'WhatsApp sent');
  return message as unknown as MessageDTO;
}

// ─── List messages for a single candidate (conversation thread) ───────────────
export async function listCandidateMessages(
  candidateId: string,
  page: number,
  limit: number
): Promise<{ messages: MessageDTO[]; total: number }> {
  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { candidateId, channel: 'WHATSAPP' },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        candidate: { select: { id: true, fullName: true, phoneNumber: true, whatsappNumber: true } },
        sentBy: { select: { id: true, name: true } },
      },
    }),
    prisma.message.count({ where: { candidateId, channel: 'WHATSAPP' } }),
  ]);

  return { messages: messages as unknown as MessageDTO[], total };
}

// ─── Shared inbox: list latest conversation per candidate ─────────────────────
export async function listInbox(): Promise<ConversationSummary[]> {
  // Get the most recent message per candidate using a raw aggregation
  const latestMessages = await prisma.message.findMany({
    where: { channel: 'WHATSAPP' },
    orderBy: { createdAt: 'desc' },
    distinct: ['candidateId'],
    include: {
      candidate: { select: { id: true, fullName: true, whatsappNumber: true } },
    },
  });

  return latestMessages.map((m) => ({
    candidateId: m.candidateId,
    candidateName: m.candidate.fullName,
    whatsappNumber: m.candidate.whatsappNumber,
    lastMessage: m.messageText.length > 80 ? m.messageText.slice(0, 80) + '…' : m.messageText,
    lastMessageAt: m.createdAt,
    lastDirection: m.direction,
    unreadCount: 0, // v1: no read tracking; placeholder for future
  }));
}
