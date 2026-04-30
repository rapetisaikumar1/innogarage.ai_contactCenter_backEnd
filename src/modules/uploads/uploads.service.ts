import { prisma } from '../../lib/prisma';
import { uploadToCloudinary, deleteFromCloudinary, getCloudinaryDeliveryResourceType } from '../../lib/cloudinary';
import { logger } from '../../lib/logger';
import { UploadedFileResult } from './uploads.types';

export async function listFiles(candidateId: string): Promise<UploadedFileResult[]> {
  const files = await prisma.candidateFile.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });
  return files;
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
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
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
  return file;
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
