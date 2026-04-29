import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { LoginInput, LoginResult, AuthUser } from './auth.types';

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
      canAccessBgc: true,
      canAccessPaymentHistory: true,
      canAccessMentors: true,
    },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!user.isActive) {
    throw Object.assign(new Error('Your account has been disabled. Please contact your administrator.'), { statusCode: 403 });
  }

  const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatch) {
    throw new Error('Invalid email or password');
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  const authUser: AuthUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canAccessBgc: user.canAccessBgc,
    canAccessPaymentHistory: user.canAccessPaymentHistory,
    canAccessMentors: user.canAccessMentors,
  };

  return { token, user: authUser };
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      canAccessBgc: true,
      canAccessPaymentHistory: true,
      canAccessMentors: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.isActive) {
    throw Object.assign(new Error('Your account has been disabled. Please contact your administrator.'), { statusCode: 403 });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canAccessBgc: user.canAccessBgc,
    canAccessPaymentHistory: user.canAccessPaymentHistory,
    canAccessMentors: user.canAccessMentors,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
