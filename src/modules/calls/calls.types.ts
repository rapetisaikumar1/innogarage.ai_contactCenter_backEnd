import { z } from 'zod';

export const logCallSchema = z.object({
  candidateId: z.string().min(1, 'Candidate ID is required'),
  direction: z.enum(['INBOUND', 'OUTBOUND'], { required_error: 'Direction is required' }),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  duration: z.coerce.number().int().min(0).optional(),
  status: z.enum(['COMPLETED', 'MISSED', 'FAILED', 'IN_PROGRESS']),
  notes: z.string().max(2000).optional(),
});

export const updateCallSchema = z.object({
  duration: z.coerce.number().int().min(0).optional(),
  status: z.enum(['COMPLETED', 'MISSED', 'FAILED', 'IN_PROGRESS']).optional(),
  notes: z.string().max(2000).optional(),
});

export const listCallsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  status: z.enum(['COMPLETED', 'MISSED', 'FAILED', 'IN_PROGRESS']).optional(),
  candidateId: z.string().optional(),
});

export type LogCallInput = z.infer<typeof logCallSchema>;
export type UpdateCallInput = z.infer<typeof updateCallSchema>;
export type ListCallsInput = z.infer<typeof listCallsSchema>;

export interface CallDTO {
  id: string;
  candidateId: string;
  loggedById: string;
  direction: 'INBOUND' | 'OUTBOUND';
  phoneNumber: string;
  duration: number | null;
  status: 'COMPLETED' | 'MISSED' | 'FAILED' | 'IN_PROGRESS';
  providerCallId: string | null;
  notes: string | null;
  createdAt: Date;
  candidate: { id: string; fullName: string; phoneNumber: string };
  loggedBy: { id: string; name: string };
}

/** Format seconds into "Xm Ys" or "Xs" */
export function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
