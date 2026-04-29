import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  canAccessBgc: boolean;
  canAccessPaymentHistory: boolean;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}
