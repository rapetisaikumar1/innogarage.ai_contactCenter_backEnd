import { z } from 'zod';

export const paymentHistoryStatusValues = [
  'PAID_ON_TIME',
  'ASKED_FOR_EXTENSION',
  'FULLY_PAID',
  'NOT_RESPONDING',
  'ABSCONDED',
] as const;

const notesSchema = z.string().max(2000, 'Notes must be 2000 characters or fewer').optional();

export const paymentHistoryIdParamSchema = z.object({
  paymentHistoryId: z.string().min(1, 'Payment history id is required'),
});

export const createPaymentHistorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name must be 120 characters or fewer'),
  placedCompany: z.string().trim().min(2, 'Placed company must be at least 2 characters').max(120, 'Placed company must be 120 characters or fewer'),
  placedJobTitle: z.string().trim().min(2, 'Placed job title must be at least 2 characters').max(120, 'Placed job title must be 120 characters or fewer'),
  status: z.enum(paymentHistoryStatusValues),
  notes: notesSchema,
});

export const updatePaymentHistorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name must be 120 characters or fewer').optional(),
  placedCompany: z.string().trim().min(2, 'Placed company must be at least 2 characters').max(120, 'Placed company must be 120 characters or fewer').optional(),
  placedJobTitle: z.string().trim().min(2, 'Placed job title must be at least 2 characters').max(120, 'Placed job title must be 120 characters or fewer').optional(),
  status: z.enum(paymentHistoryStatusValues).optional(),
  notes: notesSchema,
}).refine(
  (data) => (
    data.name !== undefined
    || data.placedCompany !== undefined
    || data.placedJobTitle !== undefined
    || data.status !== undefined
    || data.notes !== undefined
  ),
  {
    message: 'Provide at least one field to update',
  },
);

export type PaymentHistoryStatusValue = typeof paymentHistoryStatusValues[number];
export type CreatePaymentHistoryInput = z.infer<typeof createPaymentHistorySchema>;
export type UpdatePaymentHistoryInput = z.infer<typeof updatePaymentHistorySchema>;

export interface PaymentHistoryDTO {
  id: string;
  name: string;
  placedCompany: string;
  placedJobTitle: string;
  status: PaymentHistoryStatusValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}