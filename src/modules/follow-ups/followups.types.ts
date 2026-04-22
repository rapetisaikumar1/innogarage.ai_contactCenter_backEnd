import { z } from 'zod';
import { FollowUpStatus } from '@prisma/client';

export const createFollowUpSchema = z.object({
  dueAt: z.string().datetime('Invalid date format. Use ISO 8601.'),
  remarks: z.string().max(500).optional(),
});

export const updateFollowUpSchema = z.object({
  status: z.nativeEnum(FollowUpStatus),
  remarks: z.string().max(500).optional(),
  dueAt: z.string().datetime('Invalid date format. Use ISO 8601.').optional(),
});

export const listFollowUpsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(FollowUpStatus).optional(),
  overdue: z.coerce.boolean().optional(),
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
export type ListFollowUpsQuery = z.infer<typeof listFollowUpsSchema>;
