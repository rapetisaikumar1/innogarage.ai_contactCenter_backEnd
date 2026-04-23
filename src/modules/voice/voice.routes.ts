import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { handleGetToken, handleOutboundTwiml } from './voice.controller';

const router = Router();

// Public — Twilio calls this when the browser places an outbound call
router.post('/twiml/outbound', handleOutboundTwiml);

// Authenticated — frontend fetches a Voice access token
router.use(authenticate);
router.get('/token', handleGetToken);

export default router;
