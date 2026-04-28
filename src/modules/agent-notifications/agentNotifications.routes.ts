import { Router } from 'express';
import { handleList, handleMarkRead, handleMarkAllRead, handleClearCallAlerts } from './agentNotifications.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.use(authenticate);

// GET  /api/agent-notifications           – list current user's notifications
router.get('/', handleList);

// POST /api/agent-notifications/:id/read  – mark one as read
router.post('/:id/read', handleMarkRead);

// POST /api/agent-notifications/read-all  – mark all as read
router.post('/read-all', handleMarkAllRead);

// POST /api/agent-notifications/calls/:callId/clear — remove call-scoped alerts from portals
router.post('/calls/:callId/clear', handleClearCallAlerts);

export default router;
