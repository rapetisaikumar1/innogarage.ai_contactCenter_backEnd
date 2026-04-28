import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  generateVoiceAccessToken,
  dialNumberTwiml,
  validateTwilioSignature,
} from '../../lib/twilio';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { registerBrowserOutboundCall } from '../calls/calls.service';

// ─── GET /api/voice/token ─────────────────────────────────────────────────────
// Authenticated. Returns a short-lived Twilio access token so the browser can
// register as a Voice Client and place / receive WebRTC calls.
export async function handleGetToken(req: Request, res: Response, next: NextFunction) {
  try {
    // Use the authenticated user's ID as identity so each agent registers separately.
    // This ensures inbound calls can be routed to a specific agent's browser.
    const identity = req.user!.userId;
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
    // SECURITY: validate signature unless explicitly skipped (local dev only)
    if (!env.SKIP_WEBHOOK_VALIDATION) {
      const signature = req.headers['x-twilio-signature'] as string | undefined;
      if (!signature) return sendError(res, 403, 'Missing Twilio signature');
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

    // Best-effort: register the browser outbound call. Do not fail the TwiML on DB errors.
    try {
      if (candidateId && userId && callSid) {
        await registerBrowserOutboundCall({
          candidateId,
          userId,
          callSid,
          toNumber: To,
        });
        logger.info({ callSid, candidateId, userId, to: To }, 'Browser outbound call registered');
      }
    } catch (dbErr) {
      logger.error({ err: dbErr, callSid }, 'Failed to register browser outbound call');
    }

    res.set('Content-Type', 'text/xml');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const statusCallbackUrl = `${proto}://${req.get('host')}/api/calls/voice/status`;
    res.send(dialNumberTwiml(To, env.TWILIO_VOICE_NUMBER, statusCallbackUrl));
  } catch (err) {
    next(err);
  }
}
