import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import {
  logCall,
  updateCall,
  deleteCall,
  listCallsByCandidate,
  listCalls,
  handleVoiceInbound,
  handleVoiceStatus,
  initiateOutboundCall,
} from './calls.service';
import { logCallSchema, updateCallSchema, listCallsSchema } from './calls.types';
import { validateTwilioSignature, inboundCallTwiml, dialClientTwiml } from '../../lib/twilio';
import { env } from '../../config/env';

// POST /api/calls  — log a new call
export async function handleLog(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = logCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const call = await logCall(parsed.data, req.user!.userId);
    sendSuccess(res, call, 201);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/calls/:callId  — update duration/status/notes
export async function handleUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const call = await updateCall(
      req.params.callId,
      parsed.data,
      req.user!.userId,
      req.user!.role
    );
    sendSuccess(res, call);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Call not found') {
      return sendError(res, 404, err.message);
    }
    if (err instanceof Error && err.message.startsWith('Not authorised')) {
      return sendError(res, 403, err.message);
    }
    next(err);
  }
}

// DELETE /api/calls/:callId
export async function handleDelete(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCall(req.params.callId, req.user!.userId, req.user!.role);
    sendSuccess(res, { deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Call not found') {
      return sendError(res, 404, err.message);
    }
    if (err instanceof Error && err.message.startsWith('Not authorised')) {
      return sendError(res, 403, err.message);
    }
    next(err);
  }
}

// GET /api/candidates/:candidateId/calls  — per-candidate call history
export async function handleListByCandidate(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { calls, total } = await listCallsByCandidate(req.params.candidateId, page, limit);
    sendSuccess(res, {
      calls,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/calls  — dashboard: all calls with filters
export async function handleList(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listCallsSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }
    const { calls, total } = await listCalls(parsed.data);
    sendSuccess(res, {
      calls,
      pagination: {
        total,
        page: parsed.data.page,
        limit: parsed.data.limit,
        totalPages: Math.ceil(total / parsed.data.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getTwilioValidUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}${req.originalUrl}`;
}

function isValidTwilioRequest(req: Request): boolean {
  if (env.NODE_ENV !== 'production') return true;
  const signature = req.headers['x-twilio-signature'] as string;
  return validateTwilioSignature(signature, getTwilioValidUrl(req), req.body);
}

// POST /api/calls/voice/inbound — public, called by Twilio when someone calls our Voice number
export async function handleVoiceInboundWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidTwilioRequest(req)) {
      return sendError(res, 403, 'Invalid Twilio signature');
    }

    const { CallSid, From, To } = req.body as Record<string, string>;
    if (CallSid && From && To) {
      await handleVoiceInbound({ callSid: CallSid, from: From, to: To });
    }

    // Respond with TwiML — ring the agent's browser (Twilio Voice Client).
    // Falls back to a polite greeting if browser-calling isn't configured yet.
    res.set('Content-Type', 'text/xml');
    if (env.TWILIO_API_KEY && env.TWILIO_TWIML_APP_SID) {
      res.send(dialClientTwiml(env.TWILIO_AGENT_IDENTITY || 'agent'));
    } else {
      res.send(inboundCallTwiml());
    }
  } catch (err) {
    next(err);
  }
}

// POST /api/calls/voice/status — public, called by Twilio when a call ends
export async function handleVoiceStatusWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidTwilioRequest(req)) {
      return sendError(res, 403, 'Invalid Twilio signature');
    }

    const { CallSid, CallStatus, CallDuration } = req.body as Record<string, string>;
    if (CallSid && CallStatus) {
      await handleVoiceStatus({
        callSid: CallSid,
        callStatus: CallStatus,
        callDuration: CallDuration,
      });
    }

    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

// POST /api/calls/initiate — authenticated, agent triggers outbound call
export async function handleInitiateCall(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId } = req.body as { candidateId: string };
    if (!candidateId) return sendError(res, 400, 'candidateId is required');

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.get('host');
    const statusCallbackUrl = `${proto}://${host}/api/calls/voice/status`;

    const result = await initiateOutboundCall({
      candidateId,
      statusCallbackUrl,
      userId: req.user!.userId,
    });

    sendSuccess(res, result, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Candidate not found') {
      return sendError(res, 404, err.message);
    }
    if (err instanceof Error && err.message.includes('no phone number')) {
      return sendError(res, 400, err.message);
    }
    if (err instanceof Error && err.message.includes('TWILIO_VOICE_NUMBER')) {
      return sendError(res, 503, 'Voice calling is not configured on this server');
    }
    next(err);
  }
}
