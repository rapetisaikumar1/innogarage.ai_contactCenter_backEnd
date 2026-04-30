import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { listFiles, uploadFile, deleteFile, getCandidateFileDownload } from './uploads.service';
import { fileUploadSchema } from './uploads.types';

function getInlineContentDisposition(fileName: string): string {
  const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function handleList(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId } = req.params;
    const files = await listFiles(candidateId);
    sendSuccess(res, files);
  } catch (err) {
    next(err);
  }
}

export async function handleUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId } = req.params;
    const userId = req.user!.userId;

    if (!req.file) {
      return sendError(res, 400, 'No file provided');
    }

    // Validate mime type and size
    const validation = fileUploadSchema.safeParse({
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    if (!validation.success) {
      return sendError(res, 422, 'File validation failed', {
        file: validation.error.flatten().fieldErrors.mimeType ??
          validation.error.flatten().fieldErrors.size ??
          ['Invalid file'],
      });
    }

    const file = await uploadFile(
      candidateId,
      userId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    );

    sendSuccess(res, file, 201);
  } catch (err) {
    next(err);
  }
}

export async function handleView(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId, token } = req.params;
    const fileDownload = getCandidateFileDownload(candidateId, token);

    if (!fileDownload) {
      return sendError(res, 404, 'File link is invalid or expired');
    }

    const cloudinaryResponse = await fetch(fileDownload.downloadUrl);

    if (!cloudinaryResponse.ok) {
      return sendError(res, 502, 'File could not be loaded from storage');
    }

    const fileBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());

    res.setHeader('Content-Type', fileDownload.mimeType);
    res.setHeader('Content-Disposition', getInlineContentDisposition(fileDownload.originalName));
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(fileBuffer);
  } catch (err) {
    next(err);
  }
}

export async function handleDelete(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const result = await deleteFile(fileId, userId, userRole);

    if (result === 'not_found') return sendError(res, 404, 'File not found');
    if (result === 'forbidden') return sendError(res, 403, 'You do not have permission to delete this file');

    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
