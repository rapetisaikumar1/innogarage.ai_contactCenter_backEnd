import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  getCloudinaryDeliveryResourceType,
  getCloudinaryFormat,
  getCloudinaryPrivateDownloadUrl,
} from '../../lib/cloudinary';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { UploadedFileResult } from './uploads.types';

interface CandidateFileViewTokenPayload {
  candidateId: string;
  publicId: string;
  mimeType: string;
  originalName: string;
  exp: number;
}

const UPLOADED_FILE_INCLUDE = {
  uploadedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.CandidateFileInclude;

type CandidateFileWithUploader = Prisma.CandidateFileGetPayload<{ include: typeof UPLOADED_FILE_INCLUDE }>;

const CANDIDATE_FILE_VIEW_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function signTokenBody(body: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url');
}

function createCandidateFileViewToken(file: Pick<UploadedFileResult, 'candidateId' | 'publicId' | 'mimeType' | 'originalName'>): string {
  const payload: CandidateFileViewTokenPayload = {
    candidateId: file.candidateId,
    publicId: file.publicId,
    mimeType: file.mimeType,
    originalName: file.originalName,
    exp: Date.now() + CANDIDATE_FILE_VIEW_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signTokenBody(body)}`;
}

function verifyCandidateFileViewToken(candidateId: string, token: string): CandidateFileViewTokenPayload | null {
  const [body, signature] = token.split('.');

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = signTokenBody(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CandidateFileViewTokenPayload;

    if (
      payload.candidateId !== candidateId ||
      !payload.publicId ||
      !payload.mimeType ||
      !payload.originalName ||
      !Number.isFinite(payload.exp) ||
      Date.now() > payload.exp
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getSafeUploadedFileName(file: Pick<UploadedFileResult, 'originalName' | 'mimeType'>): string {
  const fallbackExtension = getCloudinaryFormat(file.mimeType, file.originalName);
  const cleanedName = file.originalName.trim().replace(/[\\/:*?"<>|]/g, '-');
  const fileName = cleanedName || `file.${fallbackExtension}`;

  return fileName.includes('.') ? fileName : `${fileName}.${fallbackExtension}`;
}

function buildCandidateFileViewUrl(file: Pick<UploadedFileResult, 'candidateId' | 'publicId' | 'mimeType' | 'originalName'>): string {
  const token = createCandidateFileViewToken(file);
  const fileName = encodeURIComponent(getSafeUploadedFileName(file));
  return `/api/candidates/${file.candidateId}/files/view/${token}/${fileName}`;
}

function toUploadedFileResult(file: CandidateFileWithUploader): UploadedFileResult {
  return {
    ...file,
    viewUrl: buildCandidateFileViewUrl(file),
  };
}

export function getCandidateFileDownload(
  candidateId: string,
  token: string,
): { downloadUrl: string; mimeType: string; originalName: string } | null {
  const payload = verifyCandidateFileViewToken(candidateId, token);

  if (!payload) {
    return null;
  }

  return {
    downloadUrl: getCloudinaryPrivateDownloadUrl(payload.publicId, payload.mimeType, payload.originalName),
    mimeType: payload.mimeType,
    originalName: getSafeUploadedFileName(payload),
  };
}

export async function listFiles(candidateId: string): Promise<UploadedFileResult[]> {
  const files = await prisma.candidateFile.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    include: UPLOADED_FILE_INCLUDE,
  });
  return files.map(toUploadedFileResult);
}

export async function uploadFile(
  candidateId: string,
  uploadedById: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  size: number
): Promise<UploadedFileResult> {
  // Verify candidate exists
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error('Candidate not found');

  // Upload to Cloudinary
  const { url, publicId } = await uploadToCloudinary(buffer, originalName, mimeType);

  // Save metadata to DB
  const file = await prisma.candidateFile.create({
    data: {
      candidateId,
      uploadedById,
      originalName,
      mimeType,
      size,
      url,
      publicId,
    },
    include: UPLOADED_FILE_INCLUDE,
  });

  await prisma.auditLog.create({
    data: {
      userId: uploadedById,
      action: 'FILE_UPLOADED',
      entityType: 'CandidateFile',
      entityId: file.id,
      metadata: { candidateId, originalName, mimeType, size },
    },
  });

  logger.info({ fileId: file.id, candidateId, originalName }, 'File uploaded');
  return toUploadedFileResult(file);
}

export async function deleteFile(
  fileId: string,
  userId: string,
  userRole: string
): Promise<'not_found' | 'forbidden' | 'deleted'> {
  const file = await prisma.candidateFile.findUnique({ where: { id: fileId } });
  if (!file) return 'not_found';

  // Only uploader or ADMIN can delete
  if (file.uploadedById !== userId && userRole !== 'ADMIN') return 'forbidden';

  // Determine resource type for Cloudinary
  const resourceType = getCloudinaryDeliveryResourceType(file.mimeType);
  await deleteFromCloudinary(file.publicId, resourceType);

  await prisma.candidateFile.delete({ where: { id: fileId } });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'FILE_DELETED',
      entityType: 'CandidateFile',
      entityId: fileId,
      metadata: { originalName: file.originalName },
    },
  });

  logger.info({ fileId, userId }, 'File deleted');
  return 'deleted';
}
