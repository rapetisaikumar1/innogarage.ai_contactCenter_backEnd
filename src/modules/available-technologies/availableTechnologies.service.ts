import { prisma } from '../../lib/prisma';
import {
  AvailableTechnologyDTO,
  CreateAvailableTechnologyInput,
  UpdateAvailableTechnologyInput,
} from './availableTechnologies.types';

const AVAILABLE_TECHNOLOGY_SELECT = {
  id: true,
  name: true,
  category: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function ensureTechnologyNameAvailable(name: string, excludeId?: string): Promise<void> {
  const existing = await prisma.availableTechnology.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw Object.assign(new Error('Technology name already exists'), { statusCode: 409 });
  }
}

export async function listAvailableTechnologies(): Promise<AvailableTechnologyDTO[]> {
  return prisma.availableTechnology.findMany({
    select: AVAILABLE_TECHNOLOGY_SELECT,
    orderBy: [
      { category: 'asc' },
      { name: 'asc' },
    ],
  });
}

export async function createAvailableTechnology(
  input: CreateAvailableTechnologyInput,
): Promise<AvailableTechnologyDTO> {
  await ensureTechnologyNameAvailable(input.name);

  return prisma.availableTechnology.create({
    data: {
      name: input.name,
      category: input.category,
      description: input.description,
    },
    select: AVAILABLE_TECHNOLOGY_SELECT,
  });
}

export async function updateAvailableTechnology(
  technologyId: string,
  input: UpdateAvailableTechnologyInput,
): Promise<AvailableTechnologyDTO> {
  const existing = await prisma.availableTechnology.findUnique({
    where: { id: technologyId },
    select: { id: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Technology not found'), { statusCode: 404 });
  }

  if (input.name !== undefined) {
    await ensureTechnologyNameAvailable(input.name, technologyId);
  }

  return prisma.availableTechnology.update({
    where: { id: technologyId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    select: AVAILABLE_TECHNOLOGY_SELECT,
  });
}

export async function deleteAvailableTechnology(technologyId: string): Promise<void> {
  const existing = await prisma.availableTechnology.findUnique({
    where: { id: technologyId },
    select: { id: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Technology not found'), { statusCode: 404 });
  }

  await prisma.availableTechnology.delete({
    where: { id: technologyId },
  });
}