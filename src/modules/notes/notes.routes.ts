import { Router } from 'express';
import { handleList, handleCreate, handleDelete } from './notes.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { createNoteSchema } from './notes.types';

const router = Router({ mergeParams: true });

router.use(authenticate);

// GET  /api/candidates/:candidateId/notes
router.get('/', handleList);

// POST /api/candidates/:candidateId/notes
router.post('/', validate(createNoteSchema), handleCreate);

// DELETE /api/candidates/:candidateId/notes/:noteId
router.delete('/:noteId', handleDelete);

export default router;
