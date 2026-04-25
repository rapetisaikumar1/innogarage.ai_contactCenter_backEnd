import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  handleWebhook,
  handleSend,
  handleInbox,
  handleListMessages,
} from './whatsapp.controller';
import {
  handleAssign,
  handleReassign,
  handleUnassign,
  handleClose,
  handleReopen,
  handleGetNotifications,
  handleMarkRead,
  handleMarkAllRead,
  handleMarkConversationRead,
} from './whatsapp.assignment.controller';

const router = Router();

// ── Public: Twilio webhook ────────────────────────────────────────────────────
router.post('/webhook', handleWebhook);

// ── All routes below require auth ─────────────────────────────────────────────
router.use(authenticate);

// Inbox (filtered by role in service)
router.get('/inbox', handleInbox);

// Send message
router.post('/send', handleSend);

// Conversation thread
router.get('/candidates/:candidateId/messages', handleListMessages);

// ── Assignment (any authenticated user) ───────────────────────────────────────
router.post('/conversations/:id/assign', handleAssign);
router.post('/conversations/:id/read', handleMarkConversationRead);

// ── Admin/Manager reassign; AGENT can transfer their own conversation ─────────
router.post('/conversations/:id/reassign', authorize('ADMIN', 'MANAGER', 'AGENT'), handleReassign);
router.post('/conversations/:id/unassign', authorize('ADMIN', 'MANAGER'), handleUnassign);
router.post('/conversations/:id/close', authorize('ADMIN', 'MANAGER'), handleClose);
router.post('/conversations/:id/reopen', authorize('ADMIN', 'MANAGER'), handleReopen);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', handleGetNotifications);
router.post('/notifications/read-all', handleMarkAllRead);
router.post('/notifications/:id/read', handleMarkRead);

export default router;
