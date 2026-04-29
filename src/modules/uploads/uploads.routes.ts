import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { handleList, handleUpload, handleDelete } from './uploads.controller';
import { MAX_FILE_SIZE_BYTES } from './uploads.types';
import { sendError } from '../../utils/response';

const router = Router({ mergeParams: true });

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Memory storage — buffer passed directly to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'File type not allowed. Accepted: images, PDF, Word, Excel.'));
    }
  },
});

function multerErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 422, 'File exceeds 10 MB limit');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendError(res, 422, err.field ?? 'File type not allowed. Accepted: images, PDF, Word, Excel.');
    }
    return sendError(res, 422, err.message);
  }
  next(err);
}

router.use(authenticate);

// GET /api/candidates/:candidateId/files
router.get('/', handleList);

// POST /api/candidates/:candidateId/files
router.post('/', upload.single('file'), multerErrorHandler, handleUpload);

// DELETE /api/candidates/:candidateId/files/:fileId
router.delete('/:fileId', handleDelete);

export default router;
