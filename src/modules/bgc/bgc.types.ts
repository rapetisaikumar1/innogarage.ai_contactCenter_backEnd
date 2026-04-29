import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const createBgcRecordSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(160),
  dob: optionalDate,
  usEmployerName: optionalText,
  usJobTitle: optionalText,
  usFromDate: optionalDate,
  usToDate: optionalDate,
  usReference1: optionalText,
  usReference2: optionalText,
  usReference3: optionalText,
  indiaEmployerName: optionalText,
  indiaJobTitle: optionalText,
  indiaFromDate: optionalDate,
  indiaToDate: optionalDate,
  indiaReference1: optionalText,
  indiaReference2: optionalText,
  indiaReference3: optionalText,
});

export type CreateBgcRecordInput = z.infer<typeof createBgcRecordSchema>;

export type BgcDocumentField = 'resumeFiles' | 'usCanadaBgcFiles' | 'indiaBgcFiles';

export interface BgcDocumentDTO {
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  publicId: string;
  uploadedAt: string;
}

export interface BgcRecordDTO {
  id: string;
  fullName: string;
  dob: Date | null;
  usEmployerName: string | null;
  usJobTitle: string | null;
  usFromDate: Date | null;
  usToDate: Date | null;
  usReference1: string | null;
  usReference2: string | null;
  usReference3: string | null;
  indiaEmployerName: string | null;
  indiaJobTitle: string | null;
  indiaFromDate: Date | null;
  indiaToDate: Date | null;
  indiaReference1: string | null;
  indiaReference2: string | null;
  indiaReference3: string | null;
  resumeFiles: BgcDocumentDTO[];
  usCanadaBgcFiles: BgcDocumentDTO[];
  indiaBgcFiles: BgcDocumentDTO[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string };
}

export const BGC_DOCUMENT_FIELDS: BgcDocumentField[] = [
  'resumeFiles',
  'usCanadaBgcFiles',
  'indiaBgcFiles',
];

export const MAX_BGC_FILES_PER_FIELD = 10;