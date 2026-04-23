import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  generateVoiceAccessToken,
  dialNumberTwiml,
  validateTwilioSignature,
} from '../../lib/twilio';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

// ─── GET /api/voice/token ─────────────────────────────────────────────────────
// Authenticated. Returns a short-lived Twilio access token so the browser can
// register as a Voice Client and place / receive WebRTC calls.
export async function handleGetToken(req: Request, res: Response, next: NextFunction) {
  try {
    const identity = env.TWILIO_AGENT_IDENTITY || 'agent';
    const token = generateVoiceAccessToken(identity);
    sendSuccess(res, { token, identity });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not configured')) {
      return sendError(res, 503, err.message);
    }
    next(err);
  }
}

// ─── POST /api/voice/twiml/outbound ───────────────────────────────────────────
// Public webhook called by Twilio when the browser places an outbound call via
// Device.connect({ params: { To, candidateId, userId } }). Returns TwiML that
// dials the real phone number, and creates a call record in the DB.
export async function handleOutboundTwiml(req: Request, res: Response, next: NextFunction) {
  try {
    if (env.NODE_ENV === 'production') {
      const signature = req.headers['x-twilio-signature'] as string;
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const url = `${proto}://${req.get('host')}${req.originalUrl}`;
      if (!validateTwilioSignature(signature, url, req.body)) {
        return sendError(res, 403, 'Invalid Twilio signature');
      }
    }

    const To = (req.body.To as string) || '';
    const candidateId = (req.body.candidateId as string) || '';
    const userId = (req.body.userId as string) || '';
    const callSid = (req.body.CallSid as string) || '';

    if (!To) {
      res.set('Content-Type', 'text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Missing destination number.</Say></Response>');
    }

    // Best-effort: log the call. Do not fail the TwiML on DB errors.
    try {
      if (candidateId && userId && callSid) {
        const existing = await prisma.call.findFirst({ where: { providerCallId: callSid } });
        if (!existing) {
          await prisma.call.create({
            data: {
              candidateId,
              loggedById: userId,
              direction: 'OUTBOUND',
              phoneNumber: To,
              status: 'IN_PROGRESS',
              providerCallId: callSid,
            },
          });
          logger.info({ callSid, candidateId, userId, to: To }, 'Browser outbound call logged');
        }
      }
    } catch (dbErr) {
      logger.error({ err: dbErr, callSid }, 'Failed to log browser outbound call');
    }

    res.set('Content-Type', 'text/xml');
    res.send(dialNumberTwiml(To, env.TWILIO_VOICE_NUMBER));
  } catch (err) {
    next(err);
  }
}
