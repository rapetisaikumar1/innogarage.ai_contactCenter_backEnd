import { Request, Response, NextFunction } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import { parseMonthYearFilter } from '../../utils/monthYearFilter';
import { createBgcRecord, getBgcDocumentDownload, getBgcRecord, listBgcRecords, updateBgcRecord } from './bgc.service';
import { BGC_DOCUMENT_FIELDS, BGC_DOCUMENT_FIELD_LABELS, BgcDocumentField, createBgcRecordSchema } from './bgc.types';

function getInlineContentDisposition(fileName: string): string {
  const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

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

export async function handleViewBgcDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const documentDownload = getBgcDocumentDownload(req.params.token);

    if (!documentDownload) {
      return sendError(res, 404, 'Document link is invalid or expired');
    }

    const cloudinaryResponse = await fetch(documentDownload.downloadUrl);

    if (!cloudinaryResponse.ok) {
      return sendError(res, 502, 'Document could not be loaded from storage');
    }

    const fileBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());

    res.setHeader('Content-Type', documentDownload.mimeType);
    res.setHeader('Content-Disposition', getInlineContentDisposition(documentDownload.originalName));
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(fileBuffer);
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