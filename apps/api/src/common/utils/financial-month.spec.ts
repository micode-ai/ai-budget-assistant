import { financialMonth, shiftFinancialMonth, normalizeAnchorDay } from './financial-month';

describe('normalizeAnchorDay', () => {
  it('accepts 1..31', () => {
    expect(normalizeAnchorDay(1)).toBe(1);
    expect(normalizeAnchorDay(10)).toBe(10);
    expect(normalizeAnchorDay(31)).toBe(31);
  });

  it('degrades anything invalid to null instead of throwing', () => {
    expect(normalizeAnchorDay(0)).toBeNull();
    expect(normalizeAnchorDay(32)).toBeNull();
    expect(normalizeAnchorDay(-5)).toBeNull();
    expect(normalizeAnchorDay(10.5)).toBeNull();
    expect(normalizeAnchorDay(NaN)).toBeNull();
    expect(normalizeAnchorDay(null)).toBeNull();
    expect(normalizeAnchorDay(undefined)).toBeNull();
    expect(normalizeAnchorDay('10')).toBeNull();
  });
});

describe('financialMonth', () => {
  it('null anchor returns the calendar month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15, 9, 30), null);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('anchor 1 equals the calendar month', () => {
    const cal = financialMonth(new Date(2026, 7, 15), null);
    const anchored = financialMonth(new Date(2026, 7, 15), 1);
    expect(anchored.start).toEqual(cal.start);
    expect(anchored.end).toEqual(cal.end);
  });

  it('after the anchor, the period starts this month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 15), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 8, 9, 23, 59, 59, 999));
  });

  it('before the anchor, the period started last month', () => {
    const { start, end } = financialMonth(new Date(2026, 7, 3), 10);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  it('exactly on the anchor day, the period starts today', () => {
    const { start } = financialMonth(new Date(2026, 7, 10, 0, 0, 0, 0), 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });

  it('clamps anchor 31 to the last day of February', () => {
    // Feb 2026 has 28 days, so the anchor clamps to the 28th. Standing ON it,
    // the period runs to the day before the next anchor (31 Mar).
    const { start, end } = financialMonth(new Date(2026, 1, 28), 31);
    expect(start).toEqual(new Date(2026, 1, 28, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 2, 30, 23, 59, 59, 999));
  });

  it('before the clamped anchor, is still inside the January period', () => {
    // 15 Feb is before the clamped 28 Feb anchor, so the live period is the
    // one that opened on 31 Jan.
    const { start, end } = financialMonth(new Date(2026, 1, 15), 31);
    expect(start).toEqual(new Date(2026, 0, 31, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 1, 27, 23, 59, 59, 999));
  });

  it('clamps anchor 31 to 29 February in a leap year', () => {
    const { start } = financialMonth(new Date(2028, 1, 29), 31);
    expect(start).toEqual(new Date(2028, 1, 29, 0, 0, 0, 0));
  });

  it('crosses the year boundary backwards', () => {
    const { start, end } = financialMonth(new Date(2026, 0, 5), 10);
    expect(start).toEqual(new Date(2025, 11, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 0, 9, 23, 59, 59, 999));
  });

  it('out-of-range anchor falls back to the calendar month', () => {
    const { start } = financialMonth(new Date(2026, 7, 15), 99);
    expect(start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });
});

describe('shiftFinancialMonth', () => {
  it('steps back one calendar month from the 31st without overflowing', () => {
    // Regression: new Date(2026,2,31).setMonth(1) yields 3 March, skipping February.
    const ref = shiftFinancialMonth(new Date(2026, 2, 31), -1, null);
    const { start } = financialMonth(ref, null);
    expect(start).toEqual(new Date(2026, 1, 1, 0, 0, 0, 0));
  });

  it('steps back one anchored period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), -1, 10);
    const { start, end } = financialMonth(ref, 10);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  it('steps forward across the year boundary', () => {
    const ref = shiftFinancialMonth(new Date(2026, 11, 20), 1, 10);
    const { start } = financialMonth(ref, 10);
    expect(start).toEqual(new Date(2027, 0, 10, 0, 0, 0, 0));
  });

  it('delta 0 stays in the same period', () => {
    const ref = shiftFinancialMonth(new Date(2026, 7, 15), 0, 10);
    const { start } = financialMonth(ref, 10);
    expect(start).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });
});
