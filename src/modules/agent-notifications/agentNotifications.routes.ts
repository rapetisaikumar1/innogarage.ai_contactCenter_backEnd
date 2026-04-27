import { Router } from 'express';
import { handleList, handleMarkRead, handleMarkAllRead } from './agentNotifications.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.use(authenticate);

// GET  /api/agent-notifications           – list current user's notifications
router.get('/', handleList);

// POST /api/agent-notifications/:id/read  – mark one as read
router.post('/:id/read', handleMarkRead);

// POST /api/agent-notifications/read-all  – mark all as read
router.post('/read-all', handleMarkAllRead);

export default router;
