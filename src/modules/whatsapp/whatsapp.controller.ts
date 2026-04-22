import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  handleInboundMessage,
  sendMessage,
  listCandidateMessages,
  listInbox,
} from './whatsapp.service';
import { sendMessageSchema, listMessagesSchema } from './whatsapp.types';
import { validateTwilioSignature } from '../../lib/twilio';
import { env } from '../../config/env';

// POST /api/whatsapp/webhook  — public, called by Twilio
export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    // Validate Twilio signature in production
    if (env.NODE_ENV === 'production') {
      const signature = req.headers['x-twilio-signature'] as string;
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const valid = validateTwilioSignature(signature, url, req.body);
      if (!valid) return sendError(res, 403, 'Invalid Twilio signature');
    }

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

// POST /api/whatsapp/send  — authenticated agents
export async function handleSend(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const message = await sendMessage(parsed.data, req.user!.userId);
    sendSuccess(res, message, 201);
  } catch (err) {
    next(err);
  }
}

// GET /api/whatsapp/inbox  — authenticated
export async function handleInbox(req: Request, res: Response, next: NextFunction) {
  try {
    const inbox = await listInbox();
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
    const { messages, total } = await listCandidateMessages(candidateId, page, limit);
    sendSuccess(res, {
      messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}
