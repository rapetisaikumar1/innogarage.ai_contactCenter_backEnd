import { z } from 'zod';

const requiredText = (label: string, max = 160) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

const requiredDate = (label: string) =>
  z.string().trim().min(1, `${label} is required`);

export const createBgcRecordSchema = z.object({
  fullName: requiredText('Full name'),
  dob: requiredDate('DOB'),
  usEmployerName: requiredText('US / Canada employer name'),
  usJobTitle: requiredText('US / Canada job title'),
  usFromDate: requiredDate('US / Canada from date'),
  usToDate: requiredDate('US / Canada to date'),
  usReference1: optionalText,
  usReference2: optionalText,
  usReference3: optionalText,
  indiaEmployerName: requiredText('Indian employer name'),
  indiaJobTitle: requiredText('Indian job title'),
  indiaFromDate: requiredDate('Indian from date'),
  indiaToDate: requiredDate('Indian to date'),
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
  viewUrl?: string;
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

export const BGC_DOCUMENT_FIELD_LABELS: Record<BgcDocumentField, string> = {
  resumeFiles: 'Resume Used',
  usCanadaBgcFiles: 'US/Canada BGC Documents',
  indiaBgcFiles: 'Indian BGC Documents',
};

export const MAX_BGC_FILES_PER_FIELD = 10;