import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  handleGetProfile,
  handleUpdateProfile,
  handleChangePassword,
  handleListUsers,
  handleCreateUser,
  handleUpdateUser,
} from './settings.controller';

const router = Router();

// All settings routes require authentication
router.use(authenticate);

// ─── Own profile ──────────────────────────────────────────────────────────────
router.get('/profile', handleGetProfile);
router.patch('/profile', ...handleUpdateProfile);
router.post('/password', ...handleChangePassword);

// ─── Team management (ADMIN + MANAGER can list; ADMIN only can create/update) ─
router.get('/users', authorize('ADMIN', 'MANAGER'), handleListUsers);
router.post('/users', authorize('ADMIN'), ...handleCreateUser);
router.patch('/users/:userId', authorize('ADMIN'), ...handleUpdateUser);

export default router;
