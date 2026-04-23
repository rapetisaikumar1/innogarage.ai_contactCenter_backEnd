import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import candidateRoutes from '../modules/candidates/candidates.routes';
import noteRoutes from '../modules/notes/notes.routes';
import followUpNestedRoutes from '../modules/follow-ups/followups.nested.routes';
import followUpRoutes from '../modules/follow-ups/followups.routes';
import uploadRoutes from '../modules/uploads/uploads.routes';
import whatsappRoutes from '../modules/whatsapp/whatsapp.routes';
import callRoutes from '../modules/calls/calls.routes';
import callNestedRoutes from '../modules/calls/calls.nested.routes';
import voiceRoutes from '../modules/voice/voice.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import settingsRoutes from '../modules/settings/settings.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/candidates/:candidateId/notes', noteRoutes);
router.use('/candidates/:candidateId/follow-ups', followUpNestedRoutes);
router.use('/candidates/:candidateId/files', uploadRoutes);
router.use('/candidates/:candidateId/calls', callNestedRoutes);
router.use('/follow-ups', followUpRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/calls', callRoutes);
router.use('/voice', voiceRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);

// Additional module routes will be added here as modules are built

export default router;
