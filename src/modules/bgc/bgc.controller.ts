import { Request, Response, NextFunction } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { createBgcRecord, listBgcRecords } from './bgc.service';
import { BGC_DOCUMENT_FIELDS, BgcDocumentField, createBgcRecordSchema } from './bgc.types';

function getUploadedFiles(req: Request): Partial<Record<BgcDocumentField, Express.Multer.File[]>> {
  const files = req.files as Partial<Record<BgcDocumentField, Express.Multer.File[]>> | undefined;
  const result: Partial<Record<BgcDocumentField, Express.Multer.File[]>> = {};

  for (const field of BGC_DOCUMENT_FIELDS) {
    result[field] = files?.[field] ?? [];
  }

  return result;
}

export async function handleListBgcRecords(_req: Request, res: Response, next: NextFunction) {
  try {
    const records = await listBgcRecords();
    sendSuccess(res, records);
  } catch (err) {
    next(err);
  }
}

export async function handleCreateBgcRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const validation = createBgcRecordSchema.safeParse(req.body);

    if (!validation.success) {
      return sendError(res, 422, 'Validation failed', validation.error.flatten().fieldErrors);
    }

    const record = await createBgcRecord(validation.data, req.user!.userId, getUploadedFiles(req));
    sendSuccess(res, record, 201);
  } catch (err) {
    next(err);
  }
}