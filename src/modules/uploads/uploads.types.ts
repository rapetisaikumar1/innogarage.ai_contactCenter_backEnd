import { z } from 'zod';

// 10MB max, common document/image types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const fileUploadSchema = z.object({
  mimeType: z.string().refine((v) => ALLOWED_MIME_TYPES.includes(v), {
    message: 'File type not allowed. Accepted: images, PDF, Word, Excel.',
  }),
  size: z.number().max(MAX_FILE_SIZE, 'File exceeds 10 MB limit'),
});

export const ALLOWED_MIME_TYPES_LIST = ALLOWED_MIME_TYPES;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE;

export interface UploadedFileResult {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  publicId: string;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}
