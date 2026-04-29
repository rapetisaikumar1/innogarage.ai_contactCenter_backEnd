import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { authorizePortalAccess } from '../../middleware/authorizePortalAccess';
import { sendError } from '../../utils/response';
import { ALLOWED_MIME_TYPES_LIST, MAX_FILE_SIZE_BYTES } from '../uploads/uploads.types';
import { handleCreateBgcRecord, handleGetBgcRecord, handleListBgcRecords, handleUpdateBgcRecord } from './bgc.controller';
import { MAX_BGC_FILES_PER_FIELD } from './bgc.types';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES_LIST.includes(file.mimetype)) {
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

router.use(authenticate, authorizePortalAccess('bgc'));

router.get('/', handleListBgcRecords);
router.get('/:recordId', handleGetBgcRecord);
router.patch(
  '/:recordId',
  upload.fields([
    { name: 'resumeFiles', maxCount: MAX_BGC_FILES_PER_FIELD },
    { name: 'usCanadaBgcFiles', maxCount: MAX_BGC_FILES_PER_FIELD },
    { name: 'indiaBgcFiles', maxCount: MAX_BGC_FILES_PER_FIELD },
  ]),
  multerErrorHandler,
  handleUpdateBgcRecord,
);
router.post(
  '/',
  upload.fields([
    { name: 'resumeFiles', maxCount: MAX_BGC_FILES_PER_FIELD },
    { name: 'usCanadaBgcFiles', maxCount: MAX_BGC_FILES_PER_FIELD },
    { name: 'indiaBgcFiles', maxCount: MAX_BGC_FILES_PER_FIELD },
  ]),
  multerErrorHandler,
  handleCreateBgcRecord,
);

export default router;