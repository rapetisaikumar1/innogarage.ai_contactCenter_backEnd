import { prisma } from '../../lib/prisma';
import { buildCreatedAtMonthYearFilter, MonthYearFilter } from '../../utils/monthYearFilter';
import {
  CreatePaymentHistoryInput,
  PaymentHistoryDTO,
  UpdatePaymentHistoryInput,
} from './paymentHistory.types';

const PAYMENT_HISTORY_SELECT = {
  id: true,
  name: true,
  placedCompany: true,
  placedJobTitle: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

function normalizeOptionalText(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function listPaymentHistories(filter?: MonthYearFilter): Promise<PaymentHistoryDTO[]> {
  const createdAtFilter = buildCreatedAtMonthYearFilter(filter);

  return prisma.paymentHistory.findMany({
    ...(createdAtFilter ? { where: { createdAt: createdAtFilter } } : {}),
    select: PAYMENT_HISTORY_SELECT,
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function getPaymentHistory(paymentHistoryId: string): Promise<PaymentHistoryDTO | null> {
  return prisma.paymentHistory.findUnique({
    where: { id: paymentHistoryId },
    select: PAYMENT_HISTORY_SELECT,
  });
}

export async function createPaymentHistory(
  input: CreatePaymentHistoryInput,
  createdById: string,
): Promise<PaymentHistoryDTO> {
  const paymentHistory = await prisma.paymentHistory.create({
    data: {
      createdById,
      name: input.name,
      placedCompany: input.placedCompany,
      placedJobTitle: input.placedJobTitle,
      status: input.status,
      notes: normalizeOptionalText(input.notes) ?? null,
    },
    select: PAYMENT_HISTORY_SELECT,
  });

  await prisma.auditLog.create({
    data: {
      userId: createdById,
      action: 'PAYMENT_HISTORY_CREATED',
      entityType: 'PaymentHistory',
      entityId: paymentHistory.id,
      metadata: {
        name: paymentHistory.name,
        placedCompany: paymentHistory.placedCompany,
        status: paymentHistory.status,
      },
    },
  });

  return paymentHistory;
}

export async function updatePaymentHistory(
  paymentHistoryId: string,
  input: UpdatePaymentHistoryInput,
  updatedById: string,
): Promise<PaymentHistoryDTO> {
  const existing = await prisma.paymentHistory.findUnique({
    where: { id: paymentHistoryId },
    select: { id: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Payment history record not found'), { statusCode: 404 });
  }

  const paymentHistory = await prisma.paymentHistory.update({
    where: { id: paymentHistoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.placedCompany !== undefined ? { placedCompany: input.placedCompany } : {}),
      ...(input.placedJobTitle !== undefined ? { placedJobTitle: input.placedJobTitle } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: normalizeOptionalText(input.notes) } : {}),
    },
    select: PAYMENT_HISTORY_SELECT,
  });

  await prisma.auditLog.create({
    data: {
      userId: updatedById,
      action: 'PAYMENT_HISTORY_UPDATED',
      entityType: 'PaymentHistory',
      entityId: paymentHistory.id,
      metadata: {
        changedFields: Object.keys(input),
        status: paymentHistory.status,
      },
    },
  });

  return paymentHistory;
}

export async function deletePaymentHistory(
  paymentHistoryId: string,
  deletedById: string,
): Promise<void> {
  const existing = await prisma.paymentHistory.findUnique({
    where: { id: paymentHistoryId },
    select: { id: true, name: true, placedCompany: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Payment history record not found'), { statusCode: 404 });
  }

  await prisma.paymentHistory.delete({
    where: { id: paymentHistoryId },
  });

  await prisma.auditLog.create({
    data: {
      userId: deletedById,
      action: 'PAYMENT_HISTORY_DELETED',
      entityType: 'PaymentHistory',
      entityId: paymentHistoryId,
      metadata: {
        name: existing.name,
        placedCompany: existing.placedCompany,
      },
    },
  });
}