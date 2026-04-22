import { Router } from 'express';
import { handleLogin, handleGetMe } from './auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { loginSchema } from './auth.types';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), handleLogin);

// GET /api/auth/me
router.get('/me', authenticate, handleGetMe);

export default router;
