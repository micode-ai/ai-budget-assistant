import type { RealSalaryCategoryRow, RealSalaryResponse, SalaryCandidate } from '@budget/shared-types';
import {
  REAL_SALARY_COUNTRIES, countryName, formatSignedPct, toneOf, statusCopy, requiredRaiseKey,
  manualCurrency, buildShareLines, briefErrorKind, parseMonthlyAmount, groupSettingsCategories,
} from '../realSalary';

const READY: RealSalaryResponse = {
  status: 'ready', baseCurrency: 'PLN', country: 'PL', countryGuessed: true, dataMonth: '2026-08',
  nominalChangePct: 5, personalInflationPct: 8.3, realChangePct: -3, requiredRaisePct: 3.1,
  breakdown: [{ division: 'CP01', weight: 0.4, ratePct: 8.3, source: 'receipts' }],
  topDrivers: ['CP01'], fxApproximate: false, computedAt: '2026-09-27T10:00:00.000Z',
};
const t = (k: string) => k;

describe('formatSignedPct', () => {
  it('signs and rounds to one decimal', () => {
    expect(formatSignedPct(5)).toBe('+5.0%');
    expect(formatSignedPct(-3.26)).toBe('−3.3%');
    expect(formatSignedPct(0)).toBe('0.0%');
    expect(formatSignedPct(-0)).toBe('0.0%');
    expect(formatSignedPct(null)).toBe('—');
  });
});

describe('toneOf', () => {
  it('maps the real change to a tone', () => {
    expect(toneOf(-3)).toBe('negative');
    expect(toneOf(2)).toBe('positive');
    expect(toneOf(0)).toBe('neutral');
    expect(toneOf(null)).toBe('neutral');
  });
});

describe('statusCopy covers every status', () => {
  it('returns null for ready and an actionable copy for the rest', () => {
    expect(statusCopy('ready')).toBeNull();
    expect(statusCopy('no_salary_confirmed')).toEqual({
      titleKey: 'realSalary.status.noSalaryTitle', bodyKey: 'realSalary.status.noSalaryBody', action: 'setup',
    });
    expect(statusCopy('salary_history_short')).toEqual({
      titleKey: 'realSalary.status.historyShortTitle', bodyKey: 'realSalary.status.historyShortBody', action: 'setup',
    });
    expect(statusCopy('spend_under_3_months')).toEqual({
      titleKey: 'realSalary.status.spendShortTitle', bodyKey: 'realSalary.status.spendShortBody', action: null,
    });
    expect(statusCopy('no_inflation_source')).toEqual({
      titleKey: 'realSalary.status.noSourceTitle', bodyKey: 'realSalary.status.noSourceBody', action: 'settings',
    });
    expect(statusCopy('encrypted')).toEqual({
      titleKey: 'realSalary.status.encryptedTitle', bodyKey: 'realSalary.status.encryptedBody', action: null,
    });
  });
});

describe('requiredRaiseKey', () => {
  it('says "ahead" when no raise is needed', () => {
    expect(requiredRaiseKey(3.1)).toBe('realSalary.requiredRaise');
    expect(requiredRaiseKey(0)).toBe('realSalary.ahead');
    expect(requiredRaiseKey(-2)).toBe('realSalary.ahead');
    expect(requiredRaiseKey(null)).toBe('realSalary.ahead');
  });
});

describe('manualCurrency uses the candidate currency', () => {
  const c = (key: string, currencyCode: string): SalaryCandidate => ({
    key, categoryId: null, categoryName: null, descriptionKey: 'x', currencyCode, typicalAmount: 1, occurrences: 2,
  });
  it('returns the chosen candidate currency, else the key suffix, else null', () => {
    expect(manualCurrency([c('a|x|EUR', 'EUR')], 'a|x|EUR')).toBe('EUR');
    expect(manualCurrency([], 'a|x|CHF')).toBe('CHF');
    expect(manualCurrency([], null)).toBeNull();
  });
});

describe('share lines carry percentages only', () => {
  it('has three lines and no money-looking value', () => {
    const lines = buildShareLines(READY, t);
    expect(lines.map((l) => l.value)).toEqual(['−3.0%', '+5.0%', '+8.3%']);
    for (const l of lines) expect(l.value).toMatch(/^[+−]?\d+\.\d%$/);
  });
});

describe('briefErrorKind', () => {
  it('maps API failures', () => {
    expect(briefErrorKind(Object.assign(new Error('x'), { status: 403, code: 'TIER_REQUIRED' }))).toBe('paywall');
    expect(briefErrorKind(Object.assign(new Error('x'), { status: 409 }))).toBe('not_ready');
    expect(briefErrorKind(Object.assign(new Error('x'), { status: 500 }))).toBe('failed');
    expect(briefErrorKind('nope')).toBe('failed');
  });
});

describe('parseMonthlyAmount handles European number formats', () => {
  it('parses grouping and decimal separators in either order, and rejects the rest', () => {
    expect(parseMonthlyAmount('8400')).toBe(8400);
    expect(parseMonthlyAmount('8 400')).toBe(8400);
    expect(parseMonthlyAmount('8 400')).toBe(8400);
    expect(parseMonthlyAmount('8.400')).toBe(8400);
    expect(parseMonthlyAmount('8,400')).toBe(8400);
    expect(parseMonthlyAmount('8.400,50')).toBe(8400.5);
    expect(parseMonthlyAmount('8,400.50')).toBe(8400.5);
    expect(parseMonthlyAmount('8400,5')).toBe(8400.5);
    expect(parseMonthlyAmount('8400.55')).toBe(8400.55);
    expect(parseMonthlyAmount('1.234.567')).toBe(1234567);
    expect(parseMonthlyAmount("8'400")).toBe(8400);
    expect(parseMonthlyAmount('')).toBeNull();
    expect(parseMonthlyAmount('   ')).toBeNull();
    expect(Number.isNaN(parseMonthlyAmount('abc'))).toBe(true);
    expect(Number.isNaN(parseMonthlyAmount('8.4.0'))).toBe(true);
    expect(Number.isNaN(parseMonthlyAmount('-100'))).toBe(true);
    expect(Number.isNaN(parseMonthlyAmount('84.00,5'))).toBe(true);
  });
});

describe('countries', () => {
  it('lists Eurostat countries with Greece as EL and names them', () => {
    expect(REAL_SALARY_COUNTRIES).toContain('PL');
    expect(REAL_SALARY_COUNTRIES).toContain('EL');
    expect(REAL_SALARY_COUNTRIES).not.toContain('GR');
    expect(countryName('XX', 'en')).toBe('XX');
    expect(typeof countryName('EL', 'en')).toBe('string');
  });
});

describe('countryName falls back to a static English table without Intl.DisplayNames', () => {
  it('still names countries, in English, regardless of the requested locale', () => {
    const IntlWithDisplayNames = Intl as unknown as { DisplayNames?: unknown };
    const original = IntlWithDisplayNames.DisplayNames;
    IntlWithDisplayNames.DisplayNames = undefined;
    try {
      expect(countryName('EL', 'pl')).toBe('Greece');
      expect(countryName('PL', 'de')).toBe('Poland');
      expect(countryName('XX', 'en')).toBe('XX');
    } finally {
      IntlWithDisplayNames.DisplayNames = original;
    }
  });
});

describe('groupSettingsCategories', () => {
  const row = (id: string, coicopDivision: RealSalaryCategoryRow['coicopDivision'], spend?: number): RealSalaryCategoryRow =>
    ({ id, name: id, icon: null, coicopDivision, spend, spendCurrency: 'PLN' });

  it('puts TOTAL and unassigned first, each group biggest spend first', () => {
    const g = groupSettingsCategories([
      row('a', 'CP01', 50), row('b', 'TOTAL', 10), row('c', null, 300), row('d', 'CP09', 900), row('e', 'TOTAL', 40),
    ]);
    expect(g.unassigned.map((r) => r.id)).toEqual(['c', 'e', 'b']);
    expect(g.assigned.map((r) => r.id)).toEqual(['d', 'a']);
  });

  it('treats a missing spend (older API) as zero and breaks ties by name', () => {
    const g = groupSettingsCategories([row('z', null), row('m', null, 0), row('k', 'CP04')]);
    expect(g.unassigned.map((r) => r.id)).toEqual(['m', 'z']);
    expect(g.assigned.map((r) => r.id)).toEqual(['k']);
  });
});
