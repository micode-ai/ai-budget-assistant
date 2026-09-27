import { BadRequestException } from '@nestjs/common';
import type { SalaryProfileDto } from '@budget/shared-types';
import { isEurostatCountry } from './coicop';

const KEY = /^[^|]*\|[^|]*\|[A-Z]{3}$/;
const MAX_MONTHLY = 10_000_000;

export function validateSalaryProfile(body: unknown): SalaryProfileDto {
  const b = body as Partial<SalaryProfileDto> | undefined;
  if (!b || typeof b !== 'object') throw new BadRequestException('Body required');
  const salaryKey = b.salaryKey ?? null;
  const manual = b.manualPreviousMonthly ?? null;
  if (salaryKey !== null && (typeof salaryKey !== 'string' || salaryKey.length > 300 || !KEY.test(salaryKey))) {
    throw new BadRequestException('Invalid salaryKey');
  }
  if (manual !== null && (typeof manual !== 'number' || !Number.isFinite(manual) || manual <= 0 || manual > MAX_MONTHLY)) {
    throw new BadRequestException('Invalid manualPreviousMonthly');
  }
  return { salaryKey, manualPreviousMonthly: manual };
}

export function validateInflationCountry(value: unknown): string | null {
  if (value === null) return null;
  if (!isEurostatCountry(value)) throw new BadRequestException('Invalid inflationCountry');
  return value;
}
