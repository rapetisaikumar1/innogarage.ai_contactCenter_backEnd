import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { handleLog, handleUpdate, handleDelete, handleList } from './calls.controller';

const router = Router();

router.use(authenticate);

// GET  /api/calls          — all calls dashboard
router.get('/', handleList);

// POST /api/calls          — log a call
router.post('/', handleLog);

// PATCH /api/calls/:callId — update a call
router.patch('/:callId', handleUpdate);

// DELETE /api/calls/:callId
router.delete('/:callId', handleDelete);

export default router;
