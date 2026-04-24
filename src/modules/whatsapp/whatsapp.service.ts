import { prisma } from '../../lib/prisma';
import { sendWhatsAppMessage } from '../../lib/twilio';
import { logger } from '../../lib/logger';
import { emitToAll, emitToUsers } from '../../lib/socket';
import { notifyUsers } from '../../lib/notifications';
import { SendMessageInput, ConversationSummary, MessageDTO } from './whatsapp.types';

// ─── Helper: get all active user IDs ─────────────────────────────────────────
async function getAllActiveUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ─── Helper: get or create Conversation for a candidate ──────────────────────
async function getOrCreateConversation(candidateId: string, whatsappPhone: string) {
  const existing = await prisma.conversation.findUnique({ where: { candidateId } });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { candidateId, whatsappPhone, status: 'UNASSIGNED' },
  });
}

// ─── Inbound webhook handler ──────────────────────────────────────────────────
export async function handleInboundMessage(params: {
  from: string;
  body: string;
  messageSid: string;
}): Promise<void> {
  const phoneNumber = params.from.replace(/^whatsapp:/, '');

  // Find or auto-create candidate
  let candidate = await prisma.candidate.findFirst({
    where: { OR: [{ whatsappNumber: phoneNumber }, { phoneNumber }] },
  });
  if (!candidate) {
    candidate = await prisma.candidate.create({
      data: {
        fullName: `Unknown (${phoneNumber})`,
        phoneNumber,
        whatsappNumber: phoneNumber,
        status: 'NEW',
      },
    });
    logger.info({ phoneNumber, candidateId: candidate.id }, 'Auto-created candidate');
  }

  // Deduplicate webhook retries
  const existing = await prisma.message.findUnique({
    where: { externalMessageId: params.messageSid },
  });
  if (existing) {
    logger.info({ messageSid: params.messageSid }, 'Duplicate webhook ignored');
    return;
  }

  // Get or create conversation
  const conversation = await getOrCreateConversation(candidate.id, phoneNumber);

  // Save message linked to conversation
  const message = await prisma.message.create({
    data: {
      candidateId: candidate.id,
      conversationId: conversation.id,
      direction: 'INBOUND',
      channel: 'WHATSAPP',
      messageText: params.body,
      externalMessageId: params.messageSid,
    },
  });

  // Update conversation's lastMessageAt
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt },
  });

  logger.info({ candidateId: candidate.id, conversationId: conversation.id }, 'Inbound stored');

  // ── Real-time events ──────────────────────────────────────────────────────

  const messagePayload = {
    id: message.id,
    conversationId: conversation.id,
    candidateId: candidate.id,
    candidateName: candidate.fullName,
    whatsappPhone: phoneNumber,
    messageText: params.body,
    direction: 'INBOUND',
    createdAt: message.createdAt,
  };

  if (conversation.status === 'UNASSIGNED') {
    // Notify all users
    const allUserIds = await getAllActiveUserIds();

    await notifyUsers({
      userIds: allUserIds,
      conversationId: conversation.id,
      type: 'whatsapp:new_unassigned_message',
      title: 'New WhatsApp message',
      body: `${candidate.fullName}: ${params.body.slice(0, 80)}`,
    });

    // Update lastNotifiedAt
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastNotifiedAt: new Date() },
    });

    // Broadcast new unassigned message to everyone
    emitToAll('whatsapp:new_unassigned_message', {
      ...messagePayload,
      conversationStatus: 'UNASSIGNED',
    });

  } else if (conversation.status === 'ASSIGNED' && conversation.assignedAgentId) {
    // Only notify assigned agent + admins
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'MANAGER'] } },
      select: { id: true },
    });
    const adminIds = admins.map((u) => u.id);
    const recipientIds = [...new Set([conversation.assignedAgentId, ...adminIds])];

    await notifyUsers({
      userIds: recipientIds,
      conversationId: conversation.id,
      type: 'whatsapp:message_received',
      title: `Message from ${candidate.fullName}`,
      body: params.body.slice(0, 80),
    });

    emitToUsers(recipientIds, 'conversation:message_received', messagePayload);
  }
}

// ─── Outbound: agent sends a message ─────────────────────────────────────────
export async function sendMessage(
  input: SendMessageInput,
  sentByUserId: string,
  senderRole: string
): Promise<MessageDTO> {
  const candidate = await prisma.candidate.findUnique({ where: { id: input.candidateId } });
  if (!candidate) throw new Error('Candidate not found');

  // Access control: agents can only send to their assigned conversations
  if (senderRole === 'AGENT') {
    const conversation = await prisma.conversation.findUnique({
      where: { candidateId: input.candidateId },
    });
    if (!conversation) throw new Error('Conversation not found');
    if (conversation.assignedAgentId !== sentByUserId) {
      throw new Error('Access denied: you are not assigned to this conversation');
    }
  }

  const toNumber = candidate.whatsappNumber ?? candidate.phoneNumber;
  if (!toNumber) throw new Error('Candidate has no phone/WhatsApp number');

  const messageSid = await sendWhatsAppMessage(toNumber, input.message);

  const conversation = await prisma.conversation.findUnique({
    where: { candidateId: input.candidateId },
  });

  const message = await prisma.message.create({
    data: {
      candidateId: input.candidateId,
      conversationId: conversation?.id,
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

  if (conversation) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt },
    });

    // Emit to assigned agent + admins
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'MANAGER'] } },
      select: { id: true },
    });
    const adminIds = admins.map((u) => u.id);
    const recipientIds = [
      ...new Set([
        ...(conversation.assignedAgentId ? [conversation.assignedAgentId] : []),
        ...adminIds,
      ]),
    ];

    emitToUsers(recipientIds, 'conversation:message_received', {
      id: message.id,
      conversationId: conversation.id,
      candidateId: input.candidateId,
      messageText: input.message,
      direction: 'OUTBOUND',
      sentBy: { id: sentByUserId },
      createdAt: message.createdAt,
    });
  }

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

// ─── List messages for a candidate thread ────────────────────────────────────
export async function listCandidateMessages(
  candidateId: string,
  page: number,
  limit: number,
  requestingUserId: string,
  requestingRole: string
): Promise<{ messages: MessageDTO[]; total: number }> {
  // Access control
  if (requestingRole === 'AGENT') {
    const conversation = await prisma.conversation.findUnique({ where: { candidateId } });
    if (!conversation || conversation.assignedAgentId !== requestingUserId) {
      throw new Error('Access denied');
    }
  }

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

// ─── Inbox: returns conversations filtered by role ────────────────────────────
export async function listInbox(
  requestingUserId: string,
  requestingRole: string,
  statusFilter?: string
): Promise<ConversationSummary[]> {
  const isAdmin = requestingRole === 'ADMIN' || requestingRole === 'MANAGER';

  const whereClause: Record<string, unknown> = {};

  if (statusFilter && ['UNASSIGNED', 'ASSIGNED', 'CLOSED'].includes(statusFilter)) {
    whereClause.status = statusFilter;
  }

  if (!isAdmin) {
    // Agents see: unassigned conversations + their own assigned ones
    whereClause.OR = [
      { status: 'UNASSIGNED' },
      { assignedAgentId: requestingUserId, status: 'ASSIGNED' },
    ];
    delete whereClause.status; // override status filter for agents
  }

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
    orderBy: { lastMessageAt: 'desc' },
    include: {
      candidate: { select: { id: true, fullName: true, whatsappNumber: true } },
      assignedAgent: { select: { id: true, name: true } },
      messages: {
        where: { channel: 'WHATSAPP' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Fetch unread notification counts for this user in one query
  const conversationIds = conversations.map((c) => c.id);
  const unreadNotifs = await prisma.notification.groupBy({
    by: ['conversationId'],
    where: {
      userId: requestingUserId,
      conversationId: { in: conversationIds },
      isRead: false,
      clearedAt: null,
    },
    _count: { id: true },
  });
  const unreadMap = new Map(unreadNotifs.map((n) => [n.conversationId, n._count.id]));

  return conversations.map((conv) => {
    const lastMsg = conv.messages[0];
    return {
      candidateId: conv.candidateId,
      conversationId: conv.id,
      candidateName: conv.candidate.fullName,
      whatsappNumber: conv.candidate.whatsappNumber,
      lastMessage: lastMsg
        ? lastMsg.messageText.length > 80
          ? lastMsg.messageText.slice(0, 80) + '…'
          : lastMsg.messageText
        : '',
      lastMessageAt: lastMsg?.createdAt ?? conv.createdAt,
      lastDirection: (lastMsg?.direction ?? 'INBOUND') as 'INBOUND' | 'OUTBOUND',
      unreadCount: unreadMap.get(conv.id) ?? 0,
      status: conv.status,
      assignedAgentId: conv.assignedAgentId,
      assignedAgentName: conv.assignedAgent?.name ?? null,
      isHighPriority: conv.isHighPriority,
    };
  });
}
