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

function normalizeTechnologyName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

async function countCandidatesForTechnology(name: string): Promise<number> {
  return prisma.candidate.count({
    where: {
      preferredRole: {
        equals: name,
        mode: 'insensitive',
      },
    },
  });
}

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
  const [technologies, candidatePreferences] = await prisma.$transaction([
    prisma.availableTechnology.findMany({
      select: AVAILABLE_TECHNOLOGY_SELECT,
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    }),
    prisma.candidate.findMany({
      where: {
        preferredRole: {
          not: null,
        },
      },
      select: {
        preferredRole: true,
      },
    }),
  ]);

  const candidateCountByTechnology = new Map<string, number>();

  for (const candidate of candidatePreferences) {
    const normalizedName = normalizeTechnologyName(candidate.preferredRole);

    if (!normalizedName) {
      continue;
    }

    candidateCountByTechnology.set(
      normalizedName,
      (candidateCountByTechnology.get(normalizedName) ?? 0) + 1,
    );
  }

  return technologies.map((technology) => ({
    ...technology,
    candidateCount: candidateCountByTechnology.get(normalizeTechnologyName(technology.name)) ?? 0,
  }));
}

export async function createAvailableTechnology(
  input: CreateAvailableTechnologyInput,
): Promise<AvailableTechnologyDTO> {
  await ensureTechnologyNameAvailable(input.name);

  const technology = await prisma.availableTechnology.create({
    data: {
      name: input.name,
      category: input.category,
      description: input.description,
    },
    select: AVAILABLE_TECHNOLOGY_SELECT,
  });

  return {
    ...technology,
    candidateCount: await countCandidatesForTechnology(technology.name),
  };
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

  const technology = await prisma.availableTechnology.update({
    where: { id: technologyId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    select: AVAILABLE_TECHNOLOGY_SELECT,
  });

  return {
    ...technology,
    candidateCount: await countCandidatesForTechnology(technology.name),
  };
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