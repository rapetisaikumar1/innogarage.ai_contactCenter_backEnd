import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { handleListByCandidate } from './calls.controller';

// Mounted at /api/candidates/:candidateId/calls — mergeParams so we get candidateId
const router = Router({ mergeParams: true });

router.use(authenticate);

// GET /api/candidates/:candidateId/calls
router.get('/', handleListByCandidate);

export default router;
