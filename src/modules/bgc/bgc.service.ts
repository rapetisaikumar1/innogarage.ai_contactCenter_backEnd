import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { uploadToCloudinary, deleteFromCloudinary } from '../../lib/cloudinary';
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

const BGC_RECORD_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
} as const satisfies Prisma.BgcRecordInclude;

function parseDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function parseDocuments(value: Prisma.JsonValue): BgcDocumentDTO[] {
  return Array.isArray(value) ? (value as unknown as BgcDocumentDTO[]) : [];
}

function toJsonDocuments(documents: BgcDocumentDTO[]): Prisma.InputJsonValue {
  return documents as unknown as Prisma.InputJsonValue;
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
      const resourceType = document.mimeType.startsWith('image/') ? 'image' : 'raw';
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