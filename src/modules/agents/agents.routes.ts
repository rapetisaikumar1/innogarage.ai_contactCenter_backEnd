import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { handleListAgents, handleGetAgentCandidates, handleUpdateAvailability } from './agents.controller';

const router = Router();

router.use(authenticate);

// GET /api/agents  — visible to all authenticated users
router.get('/', handleListAgents);

// PATCH /api/agents/availability  — any agent can update their own
router.patch('/availability', handleUpdateAvailability);

// GET /api/agents/:agentId/candidates  — admin/manager only
router.get('/:agentId/candidates', authorize('ADMIN', 'MANAGER'), handleGetAgentCandidates);

export default router;
