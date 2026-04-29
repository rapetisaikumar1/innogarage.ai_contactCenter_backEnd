import { Prisma } from '@prisma/client';

export interface MonthYearFilter {
  month?: number;
  year?: number;
}

type ParseResult = { filter: MonthYearFilter; error?: never } | { filter?: never; error: string };

function getSingleQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return getSingleQueryValue(value[0]);
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseIntegerQuery(value: unknown, label: string, min: number, max: number): { value?: number; error?: string } {
  const raw = getSingleQueryValue(value);
  if (!raw) return {};

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { error: `${label} must be between ${min} and ${max}` };
  }

  return { value: parsed };
}

export function parseMonthYearFilter(query: Record<string, unknown>): ParseResult {
  const month = parseIntegerQuery(query.month, 'Month', 1, 12);
  if (month.error) return { error: month.error };

  const year = parseIntegerQuery(query.year, 'Year', 1970, 2100);
  if (year.error) return { error: year.error };

  if (month.value !== undefined && year.value === undefined) {
    return { error: 'Year is required when filtering by month' };
  }

  return { filter: { month: month.value, year: year.value } };
}

export function buildCreatedAtMonthYearFilter(filter?: MonthYearFilter): Prisma.DateTimeFilter | undefined {
  if (!filter?.year) return undefined;

  const startMonth = filter.month ? filter.month - 1 : 0;
  const endYear = filter.month ? filter.year : filter.year + 1;
  const endMonth = filter.month ? startMonth + 1 : 0;

  return {
    gte: new Date(Date.UTC(filter.year, startMonth, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(endYear, endMonth, 1, 0, 0, 0, 0)),
  };
}