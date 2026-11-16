import { buildYearOverYearRows } from '../yearOverYear';
import { sameWindowLastYear } from '../periodWindows';

const flat = () => null;

describe('buildYearOverYearRows (ABA-797)', () => {
  it('compares each category with last year and keeps ones that stopped', () => {
    const rows = buildYearOverYearRows(
      new Map<string | null, number>([['food', 600], ['fuel', 300], ['gifts', 50]]),
      new Map<string | null, number>([['food', 500], ['fuel', 400], ['travel', 900]]),
      flat,
    );
    expect(rows.map((r) => [r.categoryId, r.current, r.lastYear, r.change])).toEqual([
      ['travel', 0, 900, -100],
      ['food', 600, 500, 20],
      ['fuel', 300, 400, -25],
      ['gifts', 50, 0, null],
    ]);
  });

  it('rolls subcategories up into their parent on both sides', () => {
    const parentOf = (id: string) => (id === 'bread' || id === 'milk' ? 'food' : null);
    const rows = buildYearOverYearRows(
      new Map<string | null, number>([['bread', 30], ['milk', 20]]),
      new Map<string | null, number>([['bread', 25], ['food', 15]]),
      parentOf,
    );
    expect(rows).toEqual([{ categoryId: 'food', current: 50, lastYear: 40, change: 25 }]);
  });
});

describe('sameWindowLastYear (ABA-797)', () => {
  const range = (a: Date, b: Date) => ({ startDate: a, endDate: b });

  it('takes the same financial month last year, cut to the days elapsed', () => {
    const w = sameWindowLastYear('month', range(new Date(2026, 10, 10), new Date(2026, 11, 9, 23, 59)), new Date(2026, 10, 16, 12), 10)!;
    expect(w.start).toEqual(new Date(2025, 10, 10));
    expect(w.end).toEqual(new Date(2025, 10, 17)); // 7 days: 10..16 November
    expect(w.partial).toBe(true);
  });

  it('takes a whole finished calendar month and the whole previous year', () => {
    const m = sameWindowLastYear('month', range(new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59)), new Date(2026, 10, 16), null)!;
    expect([m.start, m.end, m.partial]).toEqual([new Date(2025, 8, 1), new Date(2025, 9, 1), false]);
    const y = sameWindowLastYear('year', range(new Date(2025, 0, 1), new Date(2025, 11, 31, 23, 59)), new Date(2026, 10, 16), null)!;
    expect([y.start, y.end]).toEqual([new Date(2024, 0, 1), new Date(2025, 0, 1)]);
  });

  it('has nothing for a week', () => {
    expect(sameWindowLastYear('week', range(new Date(2026, 10, 9), new Date(2026, 10, 15)), new Date(2026, 10, 16))).toBeNull();
  });
});
