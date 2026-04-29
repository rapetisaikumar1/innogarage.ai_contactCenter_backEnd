import { Request, Response, NextFunction } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { parseMonthYearFilter } from '../../utils/monthYearFilter';
import { createBgcRecord, getBgcRecord, listBgcRecords, updateBgcRecord } from './bgc.service';
import { BGC_DOCUMENT_FIELDS, BGC_DOCUMENT_FIELD_LABELS, BgcDocumentField, createBgcRecordSchema } from './bgc.types';

function getUploadedFiles(req: Request): Partial<Record<BgcDocumentField, Express.Multer.File[]>> {
  const files = req.files as Partial<Record<BgcDocumentField, Express.Multer.File[]>> | undefined;
  const result: Partial<Record<BgcDocumentField, Express.Multer.File[]>> = {};

  for (const field of BGC_DOCUMENT_FIELDS) {
    result[field] = files?.[field] ?? [];
  }

  return result;
}

function getMissingRequiredFileErrors(files: Partial<Record<BgcDocumentField, Express.Multer.File[]>>): string[] {
  return BGC_DOCUMENT_FIELDS.filter((field) => (files[field] ?? []).length === 0).map(
    (field) => `${BGC_DOCUMENT_FIELD_LABELS[field]} is required.`,
  );
}

export async function handleListBgcRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedFilter = parseMonthYearFilter(req.query);
    if (parsedFilter.error) return sendError(res, 400, parsedFilter.error);

    const records = await listBgcRecords(parsedFilter.filter);
    sendSuccess(res, records);
  } catch (err) {
    next(err);
  }
}

export async function handleGetBgcRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await getBgcRecord(req.params.recordId);

    if (!record) {
      return sendError(res, 404, 'BGC record not found');
    }

    sendSuccess(res, record);
  } catch (err) {
    next(err);
  }
}

export async function handleCreateBgcRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const validation = createBgcRecordSchema.safeParse(req.body);
    const files = getUploadedFiles(req);
    const missingFileErrors = getMissingRequiredFileErrors(files);

    if (!validation.success) {
      return sendError(res, 422, 'Validation failed', validation.error.flatten().fieldErrors);
    }

    if (missingFileErrors.length > 0) {
      return sendError(res, 422, 'Validation failed', { files: missingFileErrors });
    }

    const record = await createBgcRecord(validation.data, req.user!.userId, files);
    sendSuccess(res, record, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateBgcRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const validation = createBgcRecordSchema.safeParse(req.body);
    const files = getUploadedFiles(req);

    if (!validation.success) {
      return sendError(res, 422, 'Validation failed', validation.error.flatten().fieldErrors);
    }

    const currentRecord = await getBgcRecord(req.params.recordId);

    if (!currentRecord) {
      return sendError(res, 404, 'BGC record not found');
    }

    const missingFileErrors = BGC_DOCUMENT_FIELDS.filter(
      (field) => (files[field] ?? []).length === 0 && currentRecord[field].length === 0,
    ).map((field) => `${BGC_DOCUMENT_FIELD_LABELS[field]} is required.`);

    if (missingFileErrors.length > 0) {
      return sendError(res, 422, 'Validation failed', { files: missingFileErrors });
    }

    const record = await updateBgcRecord(req.params.recordId, validation.data, req.user!.userId, files);

    if (!record) {
      return sendError(res, 404, 'BGC record not found');
    }

    sendSuccess(res, record);
  } catch (err) {
    next(err);
  }
}