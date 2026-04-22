import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import {
  UpdateProfileInput,
  ChangePasswordInput,
  CreateUserInput,
  UpdateUserInput,
  UserDTO,
} from './settings.types';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

// ─── Get own profile ──────────────────────────────────────────────────────────
export async function getProfile(userId: string): Promise<UserDTO> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });
  if (!user) throw new Error('User not found');
  return user;
}

// ─── Update own profile ───────────────────────────────────────────────────────
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDTO> {
  // Check email uniqueness if changing it
  if (input.email) {
    const existing = await prisma.user.findFirst({
      where: { email: input.email, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
    },
    select: USER_SELECT,
  });

  return updated;
}

// ─── Change own password ──────────────────────────────────────────────────────
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new Error('User not found');

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });

  const hash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
}

// ─── List all users (ADMIN / MANAGER) ────────────────────────────────────────
export async function listUsers(): Promise<UserDTO[]> {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

// ─── Create user (ADMIN only) ─────────────────────────────────────────────────
export async function createUser(input: CreateUserInput): Promise<UserDTO> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: USER_SELECT,
  });

  return user;
}

// ─── Update user (ADMIN only) ─────────────────────────────────────────────────
export async function updateUser(targetUserId: string, input: UpdateUserInput): Promise<UserDTO> {
  const existing = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!existing) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: USER_SELECT,
  });

  return updated;
}
