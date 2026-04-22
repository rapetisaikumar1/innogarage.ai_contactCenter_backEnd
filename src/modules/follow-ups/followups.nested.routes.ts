import { Router } from 'express';
import { handleListByCandidate, handleCreate } from './followups.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { createFollowUpSchema } from './followups.types';

// Nested under /api/candidates/:candidateId/follow-ups
const router = Router({ mergeParams: true });

router.use(authenticate);

// GET  /api/candidates/:candidateId/follow-ups
router.get('/', handleListByCandidate);

// POST /api/candidates/:candidateId/follow-ups
router.post('/', validate(createFollowUpSchema), handleCreate);

export default router;
