import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  handleCreateAvailableTechnology,
  handleDeleteAvailableTechnology,
  handleListAvailableTechnologies,
  handleUpdateAvailableTechnology,
} from './availableTechnologies.controller';

const router = Router();

router.use(authenticate);

router.get('/', handleListAvailableTechnologies);
router.post('/', ...handleCreateAvailableTechnology);
router.patch('/:technologyId', ...handleUpdateAvailableTechnology);
router.delete('/:technologyId', ...handleDeleteAvailableTechnology);

export default router;