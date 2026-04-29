import { z } from 'zod';

// ─── Update own profile ───────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  email: z.string().email('Invalid email address').optional(),
}).refine((d) => d.name !== undefined || d.email !== undefined, {
  message: 'Provide at least one field to update',
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Change own password ──────────────────────────────────────────────────────
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Create a new user (ADMIN only) ──────────────────────────────────────────
export const createUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).default('AGENT'),
  departmentId: z.string().min(1).optional().nullable(),
  canAccessBgc: z.boolean().default(false),
  canAccessPaymentHistory: z.boolean().default(false),
  canAccessMentors: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.role === 'AGENT' && !data.departmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['departmentId'],
      message: 'Department is required for mentors',
    });
  }
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update another user (ADMIN only) ────────────────────────────────────────
export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).optional(),
  isActive: z.boolean().optional(),
}).refine((d) => d.name !== undefined || d.role !== undefined || d.isActive !== undefined, {
  message: 'Provide at least one field to update',
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ─── Departments (ADMIN only) ────────────────────────────────────────────────
export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(100),
  description: z.string().trim().max(500).optional().nullable(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export interface DepartmentDTO {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

// ─── User DTO (safe subset) ───────────────────────────────────────────────────
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  canAccessBgc: boolean;
  canAccessPaymentHistory: boolean;
  canAccessMentors: boolean;
  isActive: boolean;
  createdAt: Date;
}
