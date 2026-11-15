import {
  comparablePreviousWindow,
  elapsedDays,
  isInProgress,
  totalDays,
  trailingMonthWindows,
} from '../periodWindows';

const june = { startDate: new Date(2026, 5, 1), endDate: new Date(2026, 5, 30, 23, 59, 59, 999) };
const midJune = new Date(2026, 5, 5, 14, 0);
const afterJune = new Date(2026, 7, 1);

describe('periodWindows', () => {
  it('counts elapsed days through today while in progress, the whole period after', () => {
    expect(isInProgress(june, midJune)).toBe(true);
    expect(elapsedDays(june, midJune)).toBe(5);
    expect(elapsedDays(june, afterJune)).toBe(30);
    expect(totalDays(june)).toBe(30);
  });

  it('treats a future period as whole, so an average never divides by zero', () => {
    expect(elapsedDays(june, new Date(2026, 0, 1))).toBe(30);
  });

  it('compares an in-progress month with the same days of the previous calendar month', () => {
    const w = comparablePreviousWindow('month', june, midJune);
    expect(w.partial).toBe(true);
    expect(w.start).toEqual(new Date(2026, 4, 1));
    expect(w.end).toEqual(new Date(2026, 4, 6)); // 1–5 May inclusive
  });

  it('compares a finished month with the whole previous calendar month', () => {
    const march = { startDate: new Date(2026, 2, 1), endDate: new Date(2026, 2, 31, 23, 59, 59, 999) };
    const w = comparablePreviousWindow('month', march, afterJune);
    expect(w.partial).toBe(false);
    expect(w.start).toEqual(new Date(2026, 1, 1)); // February, not "29 Jan – 28 Feb"
    expect(w.end).toEqual(new Date(2026, 2, 1));
  });

  it('clamps the same-days window to the shorter previous month', () => {
    const march = { startDate: new Date(2026, 2, 1), endDate: new Date(2026, 2, 31, 23, 59, 59, 999) };
    const w = comparablePreviousWindow('month', march, new Date(2026, 2, 31, 9));
    expect(w.end).toEqual(new Date(2026, 2, 1)); // all of February, no spill into March
  });

  it('compares a week and a year with the calendar week and year before', () => {
    const week = { startDate: new Date(2026, 5, 8), endDate: new Date(2026, 5, 14, 23, 59, 59, 999) };
    const w = comparablePreviousWindow('week', week, new Date(2026, 5, 10, 8));
    expect(w.start).toEqual(new Date(2026, 5, 1));
    expect(w.end).toEqual(new Date(2026, 5, 4)); // Mon–Wed

    const year = { startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31, 23, 59, 59, 999) };
    const y = comparablePreviousWindow('year', year, afterJune);
    expect(y.start).toEqual(new Date(2025, 0, 1));
    expect(y.end).toEqual(new Date(2025, 7, 2)); // on 1 Aug: 1 Jan – 1 Aug 2025 inclusive
  });

  it('cuts each trailing month to the elapsed days, oldest last', () => {
    const ws = trailingMonthWindows(june, 3, midJune);
    expect(ws.map((w) => [w.start.getMonth(), w.end.getMonth(), w.end.getDate()])).toEqual([
      [4, 4, 6],
      [3, 3, 6],
      [2, 2, 6],
    ]);
    const whole = trailingMonthWindows(june, 1, afterJune)[0];
    expect(whole.end).toEqual(new Date(2026, 5, 1));
  });
});

describe('financial months (anchor day)', () => {
  // Salary on the 10th: "October" is 10 Oct – 9 Nov.
  const october = { startDate: new Date(2026, 9, 10), endDate: new Date(2026, 10, 9, 23, 59, 59, 999) };

  it('compares with the previous FINANCIAL month, cut to the same days', () => {
    const w = comparablePreviousWindow('month', october, new Date(2026, 9, 14, 9), 10);
    expect(w.start).toEqual(new Date(2026, 8, 10));
    expect(w.end).toEqual(new Date(2026, 8, 15)); // 10–14 Sep inclusive
  });

  it('walks trailing financial months back from the anchor', () => {
    const ws = trailingMonthWindows(october, 2, new Date(2027, 0, 1), 10);
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      [new Date(2026, 8, 10), new Date(2026, 9, 10)],
      [new Date(2026, 7, 10), new Date(2026, 8, 10)],
    ]);
  });

  it('clamps an anchor above a short month to its last day', () => {
    const march = { startDate: new Date(2026, 2, 31), endDate: new Date(2026, 3, 29, 23, 59, 59, 999) };
    const w = comparablePreviousWindow('month', march, new Date(2027, 0, 1), 31);
    expect(w.start).toEqual(new Date(2026, 1, 28)); // February has no 31st
  });
});
