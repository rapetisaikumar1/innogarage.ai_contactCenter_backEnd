import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { emitToUser } from '../../lib/socket';
import {
  UpdateProfileInput,
  ChangePasswordInput,
  CreateUserInput,
  UpdateUserInput,
  CreateDepartmentInput,
  DepartmentDTO,
  UserDTO,
} from './settings.types';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  canAccessBgc: true,
  canAccessPaymentHistory: true,
  canAccessMentors: true,
  isActive: true,
  createdAt: true,
} as const;

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
} as const;

function deriveNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] || email;
  const name = localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return name.length >= 2 ? name : email;
}

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

// ─── List departments (ADMIN only) ───────────────────────────────────────────
export async function listDepartments(): Promise<DepartmentDTO[]> {
  return prisma.department.findMany({
    select: DEPARTMENT_SELECT,
    orderBy: { name: 'asc' },
  });
}

// ─── Create department (ADMIN only) ──────────────────────────────────────────
export async function createDepartment(input: CreateDepartmentInput): Promise<DepartmentDTO> {
  const name = input.name.trim();
  const existing = await prisma.department.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });

  if (existing) throw Object.assign(new Error('Department already exists'), { statusCode: 409 });

  return prisma.department.create({
    data: {
      name,
      description: input.description?.trim() || null,
    },
    select: DEPARTMENT_SELECT,
  });
}

// ─── Create user (ADMIN only) ─────────────────────────────────────────────────
export async function createUser(input: CreateUserInput): Promise<UserDTO> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });

  const isMentor = input.role === 'MENTOR';

  if (isMentor) {
    const department = await prisma.department.findUnique({
      where: { id: input.departmentId! },
      select: { id: true },
    });

    if (!department) throw Object.assign(new Error('Department not found'), { statusCode: 400 });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      name: input.name?.trim() || deriveNameFromEmail(input.email),
      email: input.email,
      passwordHash,
      role: input.role,
      departmentId: isMentor ? input.departmentId! : null,
      canAccessBgc: isMentor ? input.canAccessBgc : false,
      canAccessPaymentHistory: isMentor ? input.canAccessPaymentHistory : false,
      canAccessMentors: isMentor ? input.canAccessMentors : false,
    },
    select: USER_SELECT,
  });

  return user;
}

// ─── Update user (ADMIN only) ─────────────────────────────────────────────────
export async function updateUser(targetUserId: string, input: UpdateUserInput): Promise<UserDTO> {
  const existing = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isActive: true } });
  if (!existing) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const shouldForceLogout = existing.isActive && input.isActive === false;

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.role !== undefined && input.role !== 'MENTOR' && {
        departmentId: null,
        canAccessBgc: false,
        canAccessPaymentHistory: false,
        canAccessMentors: false,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: USER_SELECT,
  });

  if (shouldForceLogout) {
    try {
      emitToUser(targetUserId, 'account:disabled', { userId: targetUserId });
    } catch (err) {
      logger.warn({ err, targetUserId }, 'Failed to emit account disabled event');
    }
  }

  return updated;
}

// ─── Delete user (ADMIN only) ────────────────────────────────────────────────
export async function deleteUser(targetUserId: string, currentUserId: string): Promise<void> {
  if (targetUserId === currentUserId) {
    throw Object.assign(new Error('You cannot delete your own account'), { statusCode: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!existing) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  try {
    await prisma.user.delete({ where: { id: targetUserId } });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw Object.assign(new Error('This user has activity history and cannot be deleted'), { statusCode: 409 });
    }

    throw err;
  }
}
