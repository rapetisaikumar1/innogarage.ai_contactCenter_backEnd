import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  handleCreatePaymentHistory,
  handleDeletePaymentHistory,
  handleGetPaymentHistory,
  handleListPaymentHistories,
  handleUpdatePaymentHistory,
} from './paymentHistory.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/', handleListPaymentHistories);
router.get('/:paymentHistoryId', ...handleGetPaymentHistory);
router.post('/', ...handleCreatePaymentHistory);
router.patch('/:paymentHistoryId', ...handleUpdatePaymentHistory);
router.delete('/:paymentHistoryId', ...handleDeletePaymentHistory);

export default router;