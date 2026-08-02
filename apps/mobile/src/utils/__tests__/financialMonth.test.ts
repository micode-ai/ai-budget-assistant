import {
  financialMonth,
  shiftFinancialMonth,
  normalizeAnchorDay,
  formatFinancialMonth,
  computeBudgetPeriod,
} from '@budget/shared-utils';

// This file is the mirror of apps/api/src/common/utils/financial-month.spec.ts.
// The two copies of the util must agree; if you change a case here, change it there.

describe('normalizeAnchorDay (shared-utils mirror)', () => {
  it('accepts 1..31 and degrades everything else to null', () => {
    expect(normalizeAnchorDay(10)).toBe(10);
    expect(normalizeAnchorDay(0)).toBeNull();
    expect(normalizeAnchorDay(32)).toBeNull();
    expect(normalizeAnchorDay(10.5)).toBeNull();
    expect(normalizeAnchorDay(NaN)).toBeNull();
    expect(normalizeAnchorDay('10')).toBeNull();
  });
});

describe('financialMonth (shared-utils mirror)', () => {
  it('null anchor returns the calendar month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15, 9, 30), null);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('after the anchor, the period starts this month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 9, 23, 59, 59, 999));
  });

  it('before the anchor, the period started last month', () => {
    const { start } = financialMonth(new Date(2026, 7, 3), 10);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
  });

  it('clamps anchor 31 to the last day of February', () => {
    const { start } = financialMonth(new Date(2026, 1, 28), 31);
    expect(start).toEqual(new Date(2026, 1, 28, 0, 0, 0, 0));
  });

  it('before the clamped anchor, is still inside the January period', () => {
    const { start, end } = financialMonth(new Date(2026, 1, 15), 31);
    expect(start).toEqual(new Date(2026, 0, 31, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 1, 27, 23, 59, 59, 999));
  });

  it('crosses the year boundary backwards', () => {
    const { start } = financialMonth(new Date(2026, 0, 5), 10);
    expect(start).toEqual(new Date(2025, 11, 10, 0, 0, 0, 0));
  });

  it('anchor 1 equals the calendar month', () => {
    const cal = financialMonth(new Date(2026, 7, 15), null);
    const anchored = financialMonth(new Date(2026, 7, 15), 1);
    expect(anchored.start).toEqual(cal.start);
    expect(anchored.end).toEqual(cal.end);
  });

  it('exactly on the anchor day, the period starts today', () => {
    const { start } = financialMonth(new Date(2026, 7, 10, 0, 0, 0, 0), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('clamps anchor 31 to 29 February in a leap year', () => {
    const { start } = financialMonth(new Date(2028, 1, 29), 31);
    expect(start).toEqual(new Date(2028, 1, 29, 0, 0, 0, 0));
  });

  it('out-of-range anchor falls back to the calendar month', () => {
    const { start } = financialMonth(new Date(2026, 7, 15), 99);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});

describe('shiftFinancialMonth (shared-utils mirror)', () => {
  it('steps back from the 31st without overflowing', () => {
    const ref = shiftFinancialMonth(new Date(2026, 2, 31), -1, null);
    expect(financialMonth(ref, null).start).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
  });

  it('steps back one anchored period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), -1, 10);
    expect(financialMonth(ref, 10).start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
  });

  it('steps forward across the year boundary', () => {
    const ref = shiftFinancialMonth(new Date(2026, 11, 20), 1, 10);
    expect(financialMonth(ref, 10).start).toEqual(new Date(2027, 0, 10, 0, 0, 0, 0));
  });

  it('delta 0 stays in the same period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), 0, 10);
    expect(financialMonth(ref, 10).start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });
});

describe('formatFinancialMonth', () => {
  it('labels an anchored period by the month it starts in', () => {
    const { label, range } = formatFinancialMonth(
      new Date(2026, 7, 10),
      new Date(2026, 8, 9, 23, 59, 59, 999),
      'en-US',
    );
    expect(label).toBe('August');
    expect(range).toContain('Aug');
    expect(range).toContain('Sep');
  });

  it('labels a calendar month with no cross-month range', () => {
    const { label, range } = formatFinancialMonth(
      new Date(2026, 7, 1),
      new Date(2026, 7, 31, 23, 59, 59, 999),
      'en-US',
    );
    expect(label).toBe('August');
    expect(range).toContain('Aug');
  });

  it('includes the year when the period is not in the current year', () => {
    // `now` is injected so this does not silently start failing in 2024.
    const { label } = formatFinancialMonth(
      new Date(2024, 7, 10),
      new Date(2024, 8, 9),
      'en-US',
      new Date(2026, 7, 1),
    );
    expect(label).toBe('August 2024');
  });
});

describe('golden: null anchor reproduces the existing monthly budget window', () => {
  it('matches computeBudgetPeriod for a monthly budget', () => {
    const now = new Date(2026, 7, 15, 9, 30);
    const legacy = computeBudgetPeriod(
      { period: 'monthly', startDate: new Date(2026, 0, 1) },
      now,
    );
    const next = financialMonth(now, null);
    expect(next.start).toEqual(legacy.periodStart);
    expect(next.end).toEqual(legacy.periodEnd);
  });
});
