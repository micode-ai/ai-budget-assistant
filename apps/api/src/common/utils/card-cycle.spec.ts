import { clampDay, currentCycle, lastClosedCycle, nextDueDate, daysUntil } from './card-cycle';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('card-cycle', () => {
  it('clamps day 31 to the month end', () => {
    expect(clampDay(2027, 1, 31)).toBe(28);
    expect(clampDay(2028, 1, 30)).toBe(29);
  });

  it('puts the 28th on next month\'s statement when statement day is 12', () => {
    const c = currentCycle(d(2026, 11, 28), 12);
    expect(c.start).toEqual(d(2026, 11, 13));
    expect(c.end).toEqual(d(2026, 12, 12));
  });

  it('the statement day itself closes the current cycle', () => {
    const c = currentCycle(d(2026, 11, 12), 12);
    expect(c.start).toEqual(d(2026, 10, 13));
    expect(c.end).toEqual(d(2026, 11, 12));
  });

  it('handles statement day 31 across a short month', () => {
    const c = currentCycle(d(2027, 2, 10), 31);
    expect(c.start).toEqual(d(2027, 2, 1));
    expect(c.end).toEqual(d(2027, 2, 28));
  });

  it('crosses a year boundary', () => {
    const c = currentCycle(d(2026, 12, 20), 5);
    expect(c.start).toEqual(d(2026, 12, 6));
    expect(c.end).toEqual(d(2027, 1, 5));
  });

  it('lastClosedCycle is the cycle before the current one', () => {
    const c = lastClosedCycle(d(2026, 11, 28), 12);
    expect(c.start).toEqual(d(2026, 10, 13));
    expect(c.end).toEqual(d(2026, 11, 12));
  });

  it('due date is the first due day strictly after the statement', () => {
    expect(nextDueDate(d(2026, 11, 12), 27)).toEqual(d(2026, 11, 27));
    expect(nextDueDate(d(2026, 11, 20), 5)).toEqual(d(2026, 12, 5));
    expect(nextDueDate(d(2026, 11, 12), 12)).toEqual(d(2026, 12, 12));
  });

  it('daysUntil counts calendar days', () => {
    expect(daysUntil(d(2026, 11, 24), d(2026, 11, 27))).toBe(3);
    expect(daysUntil(d(2026, 11, 27), d(2026, 11, 24))).toBe(-3);
  });
});
