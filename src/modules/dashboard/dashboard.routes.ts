import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { handleGetStats } from './dashboard.controller';

const router = Router();

router.use(authenticate);

// GET /api/dashboard
router.get('/', handleGetStats);

export default router;
