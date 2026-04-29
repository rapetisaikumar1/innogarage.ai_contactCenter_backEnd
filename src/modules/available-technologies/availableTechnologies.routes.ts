import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  handleCreateAvailableTechnology,
  handleDeleteAvailableTechnology,
  handleListAvailableTechnologies,
  handleUpdateAvailableTechnology,
} from './availableTechnologies.controller';

const router = Router();

router.use(authenticate);

router.get('/', handleListAvailableTechnologies);
router.post('/', authorize('ADMIN'), ...handleCreateAvailableTechnology);
router.patch('/:technologyId', authorize('ADMIN'), ...handleUpdateAvailableTechnology);
router.delete('/:technologyId', authorize('ADMIN'), ...handleDeleteAvailableTechnology);

export default router;