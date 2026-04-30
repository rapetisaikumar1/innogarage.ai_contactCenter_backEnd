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
import { buildCreatedAtMonthYearFilter, MonthYearFilter } from '../../utils/monthYearFilter';
import {
  BGC_DOCUMENT_FIELDS,
  BgcDocumentDTO,
  BgcDocumentField,
  BgcRecordDTO,
  CreateBgcRecordInput,
} from './bgc.types';

type BgcFileGroups = Partial<Record<BgcDocumentField, Express.Multer.File[]>>;
type BgcRecordWithCreator = Prisma.BgcRecordGetPayload<{ include: typeof BGC_RECORD_INCLUDE }>;
type BgcDocumentGroups = Record<BgcDocumentField, BgcDocumentDTO[]>;

interface BgcDocumentViewTokenPayload {
  publicId: string;
  mimeType: string;
  originalName: string;
  exp: number;
}

const BGC_RECORD_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
} as const satisfies Prisma.BgcRecordInclude;

const BGC_DOCUMENT_VIEW_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function signTokenBody(body: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url');
}

function createBgcDocumentViewToken(document: BgcDocumentDTO): string {
  const payload: BgcDocumentViewTokenPayload = {
    publicId: document.publicId,
    mimeType: document.mimeType,
    originalName: document.originalName,
    exp: Date.now() + BGC_DOCUMENT_VIEW_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signTokenBody(body)}`;
}

function verifyBgcDocumentViewToken(token: string): BgcDocumentViewTokenPayload | null {
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
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as BgcDocumentViewTokenPayload;

    if (!payload.publicId || !payload.mimeType || !payload.originalName || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getSafeDocumentFileName(document: Pick<BgcDocumentDTO, 'originalName' | 'mimeType'>): string {
  const fallbackExtension = getCloudinaryFormat(document.mimeType, document.originalName);
  const cleanedName = document.originalName.trim().replace(/[\\/:*?"<>|]/g, '-');
  const fileName = cleanedName || `document.${fallbackExtension}`;

  return fileName.includes('.') ? fileName : `${fileName}.${fallbackExtension}`;
}

function buildBgcDocumentViewUrl(document: BgcDocumentDTO): string {
  const token = createBgcDocumentViewToken(document);
  const fileName = encodeURIComponent(getSafeDocumentFileName(document));
  return `/api/bgc/documents/${token}/${fileName}`;
}

function parseDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toBgcDocumentDTO(document: BgcDocumentDTO): BgcDocumentDTO {
  const { viewUrl: _viewUrl, ...storedDocument } = document;
  return {
    ...storedDocument,
    viewUrl: buildBgcDocumentViewUrl(storedDocument),
  };
}

function parseDocuments(value: Prisma.JsonValue): BgcDocumentDTO[] {
  return Array.isArray(value) ? (value as unknown as BgcDocumentDTO[]).map(toBgcDocumentDTO) : [];
}

function toJsonDocuments(documents: BgcDocumentDTO[]): Prisma.InputJsonValue {
  return documents.map(({ viewUrl: _viewUrl, ...document }) => document) as unknown as Prisma.InputJsonValue;
}

export function getBgcDocumentDownload(token: string): { downloadUrl: string; mimeType: string; originalName: string } | null {
  const payload = verifyBgcDocumentViewToken(token);

  if (!payload) {
    return null;
  }

  return {
    downloadUrl: getCloudinaryPrivateDownloadUrl(payload.publicId, payload.mimeType, payload.originalName),
    mimeType: payload.mimeType,
    originalName: getSafeDocumentFileName(payload),
  };
}

function toBgcRecordDTO(record: BgcRecordWithCreator): BgcRecordDTO {
  return {
    ...record,
    resumeFiles: parseDocuments(record.resumeFiles),
    usCanadaBgcFiles: parseDocuments(record.usCanadaBgcFiles),
    indiaBgcFiles: parseDocuments(record.indiaBgcFiles),
  };
}

function getDocumentGroups(record: BgcRecordWithCreator): BgcDocumentGroups {
  return {
    resumeFiles: parseDocuments(record.resumeFiles),
    usCanadaBgcFiles: parseDocuments(record.usCanadaBgcFiles),
    indiaBgcFiles: parseDocuments(record.indiaBgcFiles),
  };
}

async function uploadDocuments(files: Express.Multer.File[] = []): Promise<BgcDocumentDTO[]> {
  const uploadedAt = new Date().toISOString();

  return Promise.all(
    files.map(async (file) => {
      const uploaded = await uploadToCloudinary(
        file.buffer,
        file.originalname,
        file.mimetype,
        'contact-center/bgc',
      );

      return {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: uploaded.url,
        publicId: uploaded.publicId,
        uploadedAt,
      };
    }),
  );
}

async function cleanupUploadedDocuments(groups: Partial<Record<BgcDocumentField, BgcDocumentDTO[]>>) {
  const documents = BGC_DOCUMENT_FIELDS.flatMap((field) => groups[field] ?? []);

  await Promise.allSettled(
    documents.map((document) => {
      const resourceType = getCloudinaryDeliveryResourceType(document.mimeType);
      return deleteFromCloudinary(document.publicId, resourceType);
    }),
  );
}

export async function listBgcRecords(filter?: MonthYearFilter): Promise<BgcRecordDTO[]> {
  const createdAtFilter = buildCreatedAtMonthYearFilter(filter);
  const records = await prisma.bgcRecord.findMany({
    ...(createdAtFilter ? { where: { createdAt: createdAtFilter } } : {}),
    orderBy: { createdAt: 'desc' },
    include: BGC_RECORD_INCLUDE,
  });

  return records.map(toBgcRecordDTO);
}

export async function getBgcRecord(recordId: string): Promise<BgcRecordDTO | null> {
  const record = await prisma.bgcRecord.findUnique({
    where: { id: recordId },
    include: BGC_RECORD_INCLUDE,
  });

  return record ? toBgcRecordDTO(record) : null;
}

export async function createBgcRecord(
  input: CreateBgcRecordInput,
  createdById: string,
  files: BgcFileGroups,
): Promise<BgcRecordDTO> {
  const uploadedDocuments: Partial<Record<BgcDocumentField, BgcDocumentDTO[]>> = {};

  try {
    for (const field of BGC_DOCUMENT_FIELDS) {
      uploadedDocuments[field] = await uploadDocuments(files[field]);
    }

    const record = await prisma.bgcRecord.create({
      data: {
        createdById,
        fullName: input.fullName,
        dob: parseDate(input.dob),
        usEmployerName: input.usEmployerName,
        usJobTitle: input.usJobTitle,
        usFromDate: parseDate(input.usFromDate),
        usToDate: parseDate(input.usToDate),
        usReference1: input.usReference1,
        usReference2: input.usReference2,
        usReference3: input.usReference3,
        indiaEmployerName: input.indiaEmployerName,
        indiaJobTitle: input.indiaJobTitle,
        indiaFromDate: parseDate(input.indiaFromDate),
        indiaToDate: parseDate(input.indiaToDate),
        indiaReference1: input.indiaReference1,
        indiaReference2: input.indiaReference2,
        indiaReference3: input.indiaReference3,
        resumeFiles: toJsonDocuments(uploadedDocuments.resumeFiles ?? []),
        usCanadaBgcFiles: toJsonDocuments(uploadedDocuments.usCanadaBgcFiles ?? []),
        indiaBgcFiles: toJsonDocuments(uploadedDocuments.indiaBgcFiles ?? []),
      },
      include: BGC_RECORD_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        userId: createdById,
        action: 'BGC_RECORD_CREATED',
        entityType: 'BgcRecord',
        entityId: record.id,
        metadata: {
          fullName: record.fullName,
          resumeFiles: uploadedDocuments.resumeFiles?.length ?? 0,
          usCanadaBgcFiles: uploadedDocuments.usCanadaBgcFiles?.length ?? 0,
          indiaBgcFiles: uploadedDocuments.indiaBgcFiles?.length ?? 0,
        },
      },
    });

    return toBgcRecordDTO(record);
  } catch (error) {
    await cleanupUploadedDocuments(uploadedDocuments);
    throw error;
  }
}

export async function updateBgcRecord(
  recordId: string,
  input: CreateBgcRecordInput,
  updatedById: string,
  files: BgcFileGroups,
): Promise<BgcRecordDTO | null> {
  const currentRecord = await prisma.bgcRecord.findUnique({
    where: { id: recordId },
    include: BGC_RECORD_INCLUDE,
  });

  if (!currentRecord) {
    return null;
  }

  const existingDocuments = getDocumentGroups(currentRecord);
  const uploadedDocuments: Partial<Record<BgcDocumentField, BgcDocumentDTO[]>> = {};
  const replacementDocuments: BgcDocumentGroups = {
    resumeFiles: [...existingDocuments.resumeFiles],
    usCanadaBgcFiles: [...existingDocuments.usCanadaBgcFiles],
    indiaBgcFiles: [...existingDocuments.indiaBgcFiles],
  };
  const previousDocumentsToDelete: Partial<Record<BgcDocumentField, BgcDocumentDTO[]>> = {};

  try {
    for (const field of BGC_DOCUMENT_FIELDS) {
      const nextFiles = files[field] ?? [];

      if (nextFiles.length > 0) {
        uploadedDocuments[field] = await uploadDocuments(nextFiles);
        replacementDocuments[field] = uploadedDocuments[field] ?? [];
        previousDocumentsToDelete[field] = existingDocuments[field];
      }
    }

    const record = await prisma.bgcRecord.update({
      where: { id: recordId },
      data: {
        fullName: input.fullName,
        dob: parseDate(input.dob),
        usEmployerName: input.usEmployerName,
        usJobTitle: input.usJobTitle,
        usFromDate: parseDate(input.usFromDate),
        usToDate: parseDate(input.usToDate),
        usReference1: input.usReference1,
        usReference2: input.usReference2,
        usReference3: input.usReference3,
        indiaEmployerName: input.indiaEmployerName,
        indiaJobTitle: input.indiaJobTitle,
        indiaFromDate: parseDate(input.indiaFromDate),
        indiaToDate: parseDate(input.indiaToDate),
        indiaReference1: input.indiaReference1,
        indiaReference2: input.indiaReference2,
        indiaReference3: input.indiaReference3,
        resumeFiles: toJsonDocuments(replacementDocuments.resumeFiles),
        usCanadaBgcFiles: toJsonDocuments(replacementDocuments.usCanadaBgcFiles),
        indiaBgcFiles: toJsonDocuments(replacementDocuments.indiaBgcFiles),
      },
      include: BGC_RECORD_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        userId: updatedById,
        action: 'BGC_RECORD_UPDATED',
        entityType: 'BgcRecord',
        entityId: record.id,
        metadata: {
          fullName: record.fullName,
          replacedResumeFiles: uploadedDocuments.resumeFiles?.length ?? 0,
          replacedUsCanadaBgcFiles: uploadedDocuments.usCanadaBgcFiles?.length ?? 0,
          replacedIndiaBgcFiles: uploadedDocuments.indiaBgcFiles?.length ?? 0,
        },
      },
    });

    await cleanupUploadedDocuments(previousDocumentsToDelete);
    return toBgcRecordDTO(record);
  } catch (error) {
    await cleanupUploadedDocuments(uploadedDocuments);
    throw error;
  }
}