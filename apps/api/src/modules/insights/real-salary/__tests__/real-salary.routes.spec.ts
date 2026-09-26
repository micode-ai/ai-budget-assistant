import { BadRequestException } from '@nestjs/common';
import { validateSalaryProfile } from '../real-salary.validation';
import { validateInflationCountry } from '../real-salary.validation';

describe('real-salary request validation', () => {
  it('accepts a salary key and a positive manual figure', () => {
    expect(validateSalaryProfile({ salaryKey: 'c|x|PLN', manualPreviousMonthly: 8000 }))
      .toEqual({ salaryKey: 'c|x|PLN', manualPreviousMonthly: 8000 });
  });
  it('accepts clearing both', () => {
    expect(validateSalaryProfile({ salaryKey: null, manualPreviousMonthly: null }))
      .toEqual({ salaryKey: null, manualPreviousMonthly: null });
  });
  it('rejects a malformed key, a negative or absurd figure, or a missing body', () => {
    expect(() => validateSalaryProfile({ salaryKey: 'nopipes', manualPreviousMonthly: null })).toThrow(BadRequestException);
    expect(() => validateSalaryProfile({ salaryKey: 'a|b|PLN', manualPreviousMonthly: -1 })).toThrow(BadRequestException);
    expect(() => validateSalaryProfile({ salaryKey: 'a|b|PLN', manualPreviousMonthly: 1e10 })).toThrow(BadRequestException);
    expect(() => validateSalaryProfile(undefined as any)).toThrow(BadRequestException);
  });
  it('accepts a Eurostat country or null, rejects anything else', () => {
    expect(validateInflationCountry('PL')).toBe('PL');
    expect(validateInflationCountry(null)).toBeNull();
    expect(() => validateInflationCountry('GR')).toThrow(BadRequestException);
    expect(() => validateInflationCountry('pl')).toThrow(BadRequestException);
  });
});
