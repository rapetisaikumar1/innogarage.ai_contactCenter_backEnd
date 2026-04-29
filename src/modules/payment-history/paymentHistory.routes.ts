import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorizePortalAccess } from '../../middleware/authorizePortalAccess';
import {
  handleCreatePaymentHistory,
  handleDeletePaymentHistory,
  handleGetPaymentHistory,
  handleListPaymentHistories,
  handleUpdatePaymentHistory,
} from './paymentHistory.controller';

const router = Router();

router.use(authenticate);
router.use(authorizePortalAccess('paymentHistory'));

router.get('/', handleListPaymentHistories);
router.get('/:paymentHistoryId', ...handleGetPaymentHistory);
router.post('/', ...handleCreatePaymentHistory);
router.patch('/:paymentHistoryId', ...handleUpdatePaymentHistory);
router.delete('/:paymentHistoryId', ...handleDeletePaymentHistory);

export default router;