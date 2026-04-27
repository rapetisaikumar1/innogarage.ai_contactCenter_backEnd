import { Router } from 'express';
import {
  handleList,
  handleGetOne,
  handleCreate,
  handleUpdate,
  handleUpdateStatus,
  handleAssign,
  handleGetPendingTransfer,
  handleCreateTransferRequest,
  handleRespondToTransferRequest,
} from './candidates.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import {
  createCandidateSchema,
  updateCandidateSchema,
  updateStatusSchema,
} from './candidates.types';

const router = Router();

// All candidate routes require authentication
router.use(authenticate);

// GET  /api/candidates           – list with pagination, search, filters
router.get('/', handleList);

// GET  /api/candidates/:id       – full profile
router.get('/:id', handleGetOne);

// POST /api/candidates           – create candidate (admin, manager, agent)
router.post('/', validate(createCandidateSchema), handleCreate);

// PATCH /api/candidates/:id      – update candidate fields
router.patch('/:id', validate(updateCandidateSchema), handleUpdate);

// PATCH /api/candidates/:id/status – update status (tracked in status_history)
router.patch('/:id/status', validate(updateStatusSchema), handleUpdateStatus);

// POST /api/candidates/:id/assign – assign to agent (admin, manager only)
router.post('/:id/assign', authorize('ADMIN', 'MANAGER'), handleAssign);

// ── Transfer request routes ───────────────────────────────────────────────────

// GET  /api/candidates/:id/transfer-request/pending – get pending transfer for a candidate
router.get('/:id/transfer-request/pending', handleGetPendingTransfer);

// POST /api/candidates/:id/transfer-request – agent creates a transfer request
router.post('/:id/transfer-request', authorize('AGENT'), handleCreateTransferRequest);

// PATCH /api/candidates/:id/transfer-request/:requestId/respond – agent accepts/rejects
router.patch('/:id/transfer-request/:requestId/respond', authorize('AGENT'), handleRespondToTransferRequest);

export default router;
