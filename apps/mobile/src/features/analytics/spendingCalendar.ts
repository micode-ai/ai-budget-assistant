/**
 * "When do I spend" (ABA-798): a year of daily spending as a week × weekday
 * grid, and the average spend on each day of the (financial) month.
 *
 * Dates only — no time of day: the app has no purchase time for any
 * transaction (bank imports carry a date, and nothing records the hour), so an
 * hour-of-day view would be invented. Pure and store-free; tested directly.
 */
import { financialMonth, shiftFinancialMonth } from '@budget/shared-utils';

export interface DayAmount {
  /** Local midnight of the transaction's calendar day. */
  day: Date;
  amount: number;
}

export interface HeatmapCell {
  key: string; // YYYY-MM-DD
  date: Date;
  amount: number;
  /** 0 = nothing spent; 1..4 = quartile of the days that had spending. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today: drawn empty, never as "nothing spent". */
  future: boolean;
}

export interface CalendarHeatmap {
  /** Columns, oldest first; each holds Monday..Sunday. */
  weeks: HeatmapCell[][];
  activeDays: number;
  total: number;
  /** The highest-spending day in the grid, or null when there is none. */
  peak: HeatmapCell | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  return addDays(startOfDay(d), -offset);
}

function sumByDay(rows: DayAmount[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!(r.amount > 0)) continue;
    const k = dayKey(r.day);
    byDay.set(k, (byDay.get(k) ?? 0) + r.amount);
  }
  return byDay;
}

/** Value at quantile `q` of an ascending list (nearest-rank). */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

/**
 * The last `weeks` Monday-started weeks ending with the week of `today`.
 * Levels are quartiles of the days that had spending — not of the maximum —
 * so one large purchase does not wash every other day out to the palest shade.
 */
export function buildCalendarHeatmap(rows: DayAmount[], today: Date, weeks = 53): CalendarHeatmap {
  const end = startOfDay(today);
  const first = addDays(mondayOf(end), -7 * (weeks - 1));
  const byDay = sumByDay(rows.filter((r) => r.day >= first && r.day <= end));

  const amounts = [...byDay.values()].sort((a, b) => a - b);
  const q1 = quantile(amounts, 0.25);
  const q2 = quantile(amounts, 0.5);
  const q3 = quantile(amounts, 0.75);
  const levelOf = (a: number): HeatmapCell['level'] => (a <= 0 ? 0 : a <= q1 ? 1 : a <= q2 ? 2 : a <= q3 ? 3 : 4);

  let peak: HeatmapCell | null = null;
  const columns: HeatmapCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const key = dayKey(date);
      const future = date > end;
      const amount = future ? 0 : (byDay.get(key) ?? 0);
      const cell: HeatmapCell = { key, date, amount, level: future ? 0 : levelOf(amount), future };
      if (amount > 0 && (!peak || amount > peak.amount)) peak = cell;
      col.push(cell);
    }
    columns.push(col);
  }

  return {
    weeks: columns,
    activeDays: byDay.size,
    total: Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100,
    peak,
  };
}

/**
 * Average spend on each day of the month — day 1 being the first day of the
 * financial month (payday, for an anchored account) — over the `periods`
 * complete months before the current one. Index 0 is day 1. A month too short
 * to have a given day does not count toward that day's average.
 */
export function dayOfMonthAverages(
  rows: DayAmount[],
  today: Date,
  anchorDay: number | null,
  periods = 12,
): { averages: number[]; months: number } {
  const current = financialMonth(today, anchorDay).start;
  const totals = new Array<number>(31).fill(0);
  const counts = new Array<number>(31).fill(0);
  const byDay = sumByDay(rows);
  let months = 0;

  for (let i = 1; i <= periods; i++) {
    const { start, end } = financialMonth(shiftFinancialMonth(current, -i, anchorDay), anchorDay);
    const length = Math.round((startOfDay(end).getTime() - start.getTime()) / 86_400_000) + 1;
    let any = false;
    for (let d = 0; d < Math.min(length, 31); d++) {
      const amount = byDay.get(dayKey(addDays(start, d))) ?? 0;
      totals[d] += amount;
      counts[d] += 1;
      if (amount > 0) any = true;
    }
    // A month before the account had any spending would drag every average toward zero.
    if (!any) {
      for (let d = 0; d < Math.min(length, 31); d++) counts[d] -= 1;
    } else {
      months++;
    }
  }

  return {
    averages: totals.map((t, d) => (counts[d] > 0 ? Math.round((t / counts[d]) * 100) / 100 : 0)),
    months,
  };
}

/**
 * The three consecutive days with the highest average — "most of the money
 * goes on days 1–3". 0-based start index, or null without data.
 */
export function busiestStretch(averages: number[], length = 3): number | null {
  let best = -1;
  let bestSum = 0;
  for (let i = 0; i + length <= averages.length; i++) {
    const sum = averages.slice(i, i + length).reduce((s, v) => s + v, 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}
