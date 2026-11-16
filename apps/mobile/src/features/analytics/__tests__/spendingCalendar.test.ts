import { buildCalendarHeatmap, busiestStretch, dayOfMonthAverages } from '../spendingCalendar';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('buildCalendarHeatmap (ABA-798)', () => {
  // Monday 16 November 2026.
  const today = d(2026, 11, 16);

  it('lays out Monday-started weeks ending with this week, future days empty', () => {
    const h = buildCalendarHeatmap([], today, 2);
    expect(h.weeks).toHaveLength(2);
    expect(h.weeks[0][0].key).toBe('2026-11-09');
    expect(h.weeks[1][0].key).toBe('2026-11-16');
    expect(h.weeks[1][1].future).toBe(true);
    expect(h.peak).toBeNull();
    expect(h.activeDays).toBe(0);
  });

  it('sums each day and grades it against the other spending days, not the maximum', () => {
    const rows = [
      { day: d(2026, 11, 9), amount: 10 },
      { day: d(2026, 11, 9), amount: 5 },
      { day: d(2026, 11, 10), amount: 20 },
      { day: d(2026, 11, 11), amount: 30 },
      { day: d(2026, 11, 12), amount: 5000 },
      { day: d(2026, 11, 20), amount: 99 }, // future: ignored
      { day: d(2025, 1, 1), amount: 99 }, // before the grid: ignored
    ];
    const h = buildCalendarHeatmap(rows, today, 2);
    const levels = h.weeks[0].slice(0, 4).map((c) => [c.amount, c.level]);
    expect(levels).toEqual([[15, 1], [20, 2], [30, 3], [5000, 4]]);
    expect(h.weeks[0][4].level).toBe(0);
    expect(h.activeDays).toBe(4);
    expect(h.total).toBe(5065);
    expect(h.peak?.key).toBe('2026-11-12');
  });
});

describe('dayOfMonthAverages (ABA-798)', () => {
  it('averages each day of the calendar month over complete months that had spending', () => {
    const rows = [
      { day: d(2026, 10, 1), amount: 100 },
      { day: d(2026, 9, 1), amount: 50 },
      { day: d(2026, 9, 30), amount: 30 },
      { day: d(2026, 10, 31), amount: 40 },
    ];
    const { averages, months } = dayOfMonthAverages(rows, d(2026, 11, 16), null, 3);
    // August had no spending at all, so only September and October count.
    expect(months).toBe(2);
    expect(averages[0]).toBe(75);
    expect(averages[29]).toBe(15);
    expect(averages[30]).toBe(40); // only October has a 31st
  });

  it('counts day 1 from the anchor day of a financial month', () => {
    const rows = [{ day: d(2026, 10, 10), amount: 300 }, { day: d(2026, 10, 12), amount: 30 }];
    const { averages } = dayOfMonthAverages(rows, d(2026, 11, 16), 10, 1);
    expect(averages[0]).toBe(300);
    expect(averages[2]).toBe(30);
  });
});

describe('busiestStretch', () => {
  it('finds the three-day window with the most spending', () => {
    expect(busiestStretch([1, 1, 1, 9, 9, 9, 1])).toBe(3);
    expect(busiestStretch([0, 0, 0, 0])).toBeNull();
  });
});
