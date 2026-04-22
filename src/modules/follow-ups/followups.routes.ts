import { Router } from 'express';
import { handleList, handleUpdate } from './followups.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { updateFollowUpSchema, listFollowUpsSchema } from './followups.types';

const router = Router();

router.use(authenticate);

// GET  /api/follow-ups             – dashboard: all follow-ups for logged-in user/team
router.get('/', handleList);

// PATCH /api/follow-ups/:followUpId – complete, reschedule, or update
router.patch('/:followUpId', validate(updateFollowUpSchema), handleUpdate);

export default router;
