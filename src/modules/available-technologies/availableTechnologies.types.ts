import { z } from 'zod';

export const technologyCategoryValues = [
  'MARKETING_AUTOMATION_ADOBE_STACK',
  'DATA_ANALYTICS_CDP',
  'CORE_ENGINEERING_DEVELOPMENT',
  'AUTOMATION_TESTING_VALIDATION',
  'INFRASTRUCTURE_OPERATIONS',
  'ENTERPRISE_TOOLS_BUSINESS_SYSTEMS',
  'SEMICONDUCTOR_HARDWARE',
  'MISC_OTHER',
] as const;

const optionalDescriptionSchema = z
  .string()
  .trim()
  .max(240, 'Description must be 240 characters or fewer')
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    return value.length > 0 ? value : undefined;
  });

export const technologyIdParamSchema = z.object({
  technologyId: z.string().min(1, 'Technology id is required'),
});

export const createAvailableTechnologySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be 100 characters or fewer'),
  category: z.enum(technologyCategoryValues),
  description: optionalDescriptionSchema,
});

export const updateAvailableTechnologySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be 100 characters or fewer').optional(),
  category: z.enum(technologyCategoryValues).optional(),
  description: optionalDescriptionSchema,
}).refine((data) => data.name !== undefined || data.category !== undefined || data.description !== undefined, {
  message: 'Provide at least one field to update',
});

export type TechnologyCategoryValue = typeof technologyCategoryValues[number];
export type CreateAvailableTechnologyInput = z.infer<typeof createAvailableTechnologySchema>;
export type UpdateAvailableTechnologyInput = z.infer<typeof updateAvailableTechnologySchema>;

export interface AvailableTechnologyDTO {
  id: string;
  name: string;
  category: TechnologyCategoryValue;
  description: string | null;
  candidateCount: number;
  createdAt: Date;
  updatedAt: Date;
}