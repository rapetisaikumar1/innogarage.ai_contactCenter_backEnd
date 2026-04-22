import { z } from 'zod';
import { CandidateStatus } from '@prisma/client';

export const createCandidateSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  phoneNumber: z.string().min(5, 'Phone number is required').max(20),
  whatsappNumber: z.string().max(20).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  city: z.string().max(100).optional(),
  qualification: z.string().max(200).optional(),
  skills: z.string().max(500).optional(),
  experience: z.string().max(200).optional(),
  preferredRole: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
});

export const updateCandidateSchema = createCandidateSchema.partial();

export const updateStatusSchema = z.object({
  status: z.nativeEnum(CandidateStatus),
});

export const listCandidatesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(CandidateStatus).optional(),
  assignedToMe: z.coerce.boolean().optional(),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListCandidatesQuery = z.infer<typeof listCandidatesSchema>;
