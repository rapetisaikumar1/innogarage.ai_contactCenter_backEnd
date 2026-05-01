import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  handleInboundMessage,
  handleOutboundStatusUpdate,
  sendMessage,
  listCandidateMessages,
  listInbox,
} from './whatsapp.service';
import { sendMessageSchema, listMessagesSchema } from './whatsapp.types';
import { validateTwilioSignature } from '../../lib/twilio';
import { env } from '../../config/env';

function getPublicRequestUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}${req.originalUrl}`;
}

function getWhatsAppStatusCallbackUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}/api/whatsapp/status`;
}

function isValidTwilioWebhook(req: Request): boolean {
  if (env.SKIP_WEBHOOK_VALIDATION) return true;
  const signature = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;
  return validateTwilioSignature(signature, getPublicRequestUrl(req), req.body);
}

// POST /api/whatsapp/webhook  — public, called by Twilio
export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    // SECURITY: validate Twilio signature on every webhook call. Only skip when an
    // operator explicitly opts out via SKIP_WEBHOOK_VALIDATION=true (local dev only).
    if (!isValidTwilioWebhook(req)) return sendError(res, 403, 'Invalid Twilio signature');

    const { From, Body, MessageSid } = req.body as Record<string, string>;
    if (!From || !Body || !MessageSid) {
      return sendError(res, 400, 'Missing required Twilio webhook fields');
    }

    await handleInboundMessage({ from: From, body: Body, messageSid: MessageSid });

    // Twilio expects a TwiML response (empty is fine to suppress auto-reply)
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/status — public, called by Twilio for outbound statuses
export async function handleStatusWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidTwilioWebhook(req)) return sendError(res, 403, 'Invalid Twilio signature');

    const { MessageSid, MessageStatus, SmsStatus } = req.body as Record<string, string | undefined>;
    const status = MessageStatus ?? SmsStatus;
    if (!MessageSid || !status) {
      return sendError(res, 400, 'Missing required Twilio status webhook fields');
    }

    await handleOutboundStatusUpdate({ messageSid: MessageSid, status });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/whatsapp/send  — authenticated agents
export async function handleSend(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const message = await sendMessage(parsed.data, req.user!.userId, req.user!.role, getWhatsAppStatusCallbackUrl(req));
    sendSuccess(res, message, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Access denied')) {
      return sendError(res, 403, err.message);
    }
    next(err);
  }
}

// GET /api/whatsapp/inbox  — authenticated
export async function handleInbox(req: Request, res: Response, next: NextFunction) {
  try {
    const statusFilter = req.query.status as string | undefined;
    const inbox = await listInbox(req.user!.userId, req.user!.role, statusFilter);
    sendSuccess(res, inbox);
  } catch (err) {
    next(err);
  }
}

// GET /api/whatsapp/candidates/:candidateId/messages  — authenticated
export async function handleListMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId } = req.params;
    const parsed = listMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const { page, limit } = parsed.data;
    const { messages, total } = await listCandidateMessages(
      candidateId,
      page,
      limit,
      req.user!.userId,
      req.user!.role
    );
    sendSuccess(res, {
      messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Access denied') {
      return sendError(res, 403, 'Access denied');
    }
    next(err);
  }
}
