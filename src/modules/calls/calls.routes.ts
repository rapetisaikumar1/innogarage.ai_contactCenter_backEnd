import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  handleLog,
  handleUpdate,
  handleDelete,
  handleList,
  handleVoiceInboundWebhook,
  handleVoiceStatusWebhook,
  handleInitiateCall,
} from './calls.controller';

const router = Router();

// ── Public Twilio Voice webhooks (no auth — called by Twilio) ─────────────────
router.post('/voice/inbound', handleVoiceInboundWebhook);
router.post('/voice/status', handleVoiceStatusWebhook);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(authenticate);

// GET  /api/calls          — all calls dashboard
router.get('/', handleList);

// POST /api/calls          — log a call manually
router.post('/', handleLog);

// POST /api/calls/initiate — trigger an outbound call via Twilio Voice
router.post('/initiate', handleInitiateCall);

// PATCH /api/calls/:callId — update a call
router.patch('/:callId', handleUpdate);

// DELETE /api/calls/:callId
router.delete('/:callId', handleDelete);

export default router;
