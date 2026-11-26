import { attributeToCategories } from '@budget/shared-utils';

export type ReductionBaseline = 'lastMonth' | 'avg3Months' | 'lastYearSameMonth';

export interface ReductionExpense {
  date: Date | string;
  amount: number;
  categoryId?: string | null;
  currencyCode?: string;
  isDeleted?: boolean;
  isPlanned?: boolean;
  splits?: Array<{ categoryId: string; amount: number; isDeleted?: boolean }>;
}

/** Month index since year 0, so month arithmetic is plain subtraction. */
function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

/** Split-aware spend of one category over whole calendar months, keyed by monthIndex. */
function monthlySpend(
  expenses: readonly ReductionExpense[],
  categoryId: string,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of expenses) {
    if (e.isDeleted || e.isPlanned) continue;
    const key = monthIndex(new Date(e.date));
    for (const part of attributeToCategories(e)) {
      if (part.categoryId !== categoryId) continue;
      out.set(key, (out.get(key) ?? 0) + part.amount);
    }
  }
  return out;
}

/**
 * The category's baseline monthly spend in `currencyCode` (budgets do not convert: only
 * expenses in the budget's own currency count, as in budget progress). 0 means "no spend in
 * that period"; null means the loaded expenses do not reach back to the baseline period, so
 * any figure would be understated.
 */
export function computeReductionBaseline(
  expenses: readonly ReductionExpense[],
  categoryId: string,
  baseline: ReductionBaseline,
  now: Date = new Date(),
  currencyCode?: string,
): number | null {
  const current = monthIndex(now);
  const firstMonth = baseline === 'lastMonth' ? current - 1 : baseline === 'lastYearSameMonth' ? current - 12 : current - 3;
  let earliest = Infinity;
  for (const e of expenses) {
    if (e.isDeleted) continue;
    const t = new Date(e.date).getTime();
    if (t < earliest) earliest = t;
  }
  const firstDay = new Date(Math.floor(firstMonth / 12), firstMonth % 12, 1).getTime();
  if (!(earliest <= firstDay)) return null;

  const scoped = currencyCode ? expenses.filter((e) => e.currencyCode === currencyCode) : expenses;
  const spend = monthlySpend(scoped, categoryId);
  if (baseline === 'lastMonth') return spend.get(current - 1) ?? 0;
  if (baseline === 'lastYearSameMonth') return spend.get(current - 12) ?? 0;
  const sum = [1, 2, 3].reduce((s, back) => s + (spend.get(current - back) ?? 0), 0);
  return sum / 3;
}

export function applyReduction(baseline: number, percent: number): number {
  if (!(baseline > 0) || !(percent > 0 && percent < 100)) return 0;
  return Math.round(baseline * (1 - percent / 100) * 100) / 100;
}
