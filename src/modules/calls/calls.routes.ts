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
  handleListLiveVoiceSessions,
  handleClaimIncomingVoiceCall,
  handleRejectIncomingVoiceCall,
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

// GET /api/calls/voice/live — current live ringing/active sessions
router.get('/voice/live', handleListLiveVoiceSessions);

// POST /api/calls/voice/:sessionId/claim — claim an inbound ringing call
router.post('/voice/:sessionId/claim', handleClaimIncomingVoiceCall);

// POST /api/calls/voice/:sessionId/reject — decline locally
router.post('/voice/:sessionId/reject', handleRejectIncomingVoiceCall);

// PATCH /api/calls/:callId — update a call
router.patch('/:callId', handleUpdate);

// DELETE /api/calls/:callId
router.delete('/:callId', handleDelete);

export default router;
