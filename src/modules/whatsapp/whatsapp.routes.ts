import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  handleWebhook,
  handleSend,
  handleInbox,
  handleListMessages,
} from './whatsapp.controller';

const router = Router();

// Public: Twilio webhook (no auth — verified by signature in production)
router.post('/webhook', handleWebhook);

// Protected: all other routes require a logged-in user
router.use(authenticate);

// GET  /api/whatsapp/inbox                              — shared inbox
router.get('/inbox', handleInbox);

// POST /api/whatsapp/send                               — send outbound message
router.post('/send', handleSend);

// GET  /api/whatsapp/candidates/:candidateId/messages   — conversation thread
router.get('/candidates/:candidateId/messages', handleListMessages);

export default router;
