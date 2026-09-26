import type { SalaryCandidate } from '@budget/shared-types';
import { round1 } from './real-salary.util';

export interface IncomeRow {
  amount: number;
  currencyCode: string;
  date: Date;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isDebt: boolean;
  isDebtRepayment: boolean;
  clientId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 90;
const GAP_MIN = 20; // Allow shifted paydays across weekends/holidays
const GAP_MAX = 40;
const MIN_OCCURRENCES = 2;
/** Minimum number of pay periods for a 12-month window to be usable. */
const MIN_PERIODS_PER_WINDOW = 3;
/** A payment this soon after the first payment of a pay period belongs to that period. */
const PERIOD_JOIN_DAYS = 15;

/** Digits and punctuation vary month to month ("Salary 09/2026") — drop them. */
export function descriptionKey(description: string | null): string {
  return (description ?? '')
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Category + description + currency — never amount, so a raise keeps one series. */
export function salaryKeyOf(r: Pick<IncomeRow, 'categoryId' | 'description' | 'currencyCode'>): string {
  return `${r.categoryId ?? ''}|${descriptionKey(r.description)}|${r.currencyCode}`;
}

export function isSalaryEligible(r: IncomeRow): boolean {
  return r.amount > 0 && !r.isDebt && !r.isDebtRepayment && !r.clientId.startsWith('transfer-income-');
}

/** Remove same-day duplicate income (same salary key, same calendar day, same amount). */
function removeDuplicates(rows: IncomeRow[]): IncomeRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${salaryKeyOf(r)}|${r.date.toISOString().split('T')[0]}|${r.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findSalaryCandidates(rows: IncomeRow[], now: Date): SalaryCandidate[] {
  const since = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  const eligible = rows.filter((r) => isSalaryEligible(r) && r.date.getTime() >= since && r.date.getTime() <= now.getTime());
  const deduped = removeDuplicates(eligible);
  const groups = new Map<string, IncomeRow[]>();
  for (const r of deduped) {
    const k = salaryKeyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const out: SalaryCandidate[] = [];
  for (const [key, g] of groups) {
    if (g.length < MIN_OCCURRENCES) continue;
    g.sort((a, b) => a.date.getTime() - b.date.getTime());
    let monthly = true;
    for (let i = 1; i < g.length; i++) {
      const gap = (g[i].date.getTime() - g[i - 1].date.getTime()) / DAY_MS;
      if (gap < GAP_MIN || gap > GAP_MAX) { monthly = false; break; }
    }
    if (!monthly) continue;
    const mean = g.reduce((s, r) => s + r.amount, 0) / g.length;
    out.push({
      key,
      categoryId: g[0].categoryId,
      categoryName: g[0].categoryName,
      descriptionKey: descriptionKey(g[0].description),
      currencyCode: g[0].currencyCode,
      typicalAmount: Math.round(mean * 100) / 100,
      occurrences: g.length,
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/**
 * Mean salary per PAY PERIOD, not per calendar month: a payday moved to the
 * previous working day can put two payments in one month and none in the next,
 * which "sum ÷ months with a payment" would read as a raise. Rows are sorted by
 * date; a row under PERIOD_JOIN_DAYS after the first row of the current period
 * joins it (a split salary, two amounts on one day), otherwise it opens a new one.
 * mean = window total ÷ number of periods; null below the minimum.
 */
function windowMean(
  rows: IncomeRow[], from: number, to: number, convert: (a: number, c: string) => number | null,
): { mean: number | null; fxMissing: boolean } {
  let fxMissing = false;
  const inWindow: { t: number; v: number }[] = [];
  for (const r of rows) {
    const t = r.date.getTime();
    if (t < from || t >= to) continue;
    const v = convert(r.amount, r.currencyCode);
    if (v === null) { fxMissing = true; continue; }
    inWindow.push({ t, v });
  }
  inWindow.sort((a, b) => a.t - b.t);
  let periods = 0;
  let periodStart = -Infinity;
  let sum = 0;
  for (const { t, v } of inWindow) {
    if (t - periodStart >= PERIOD_JOIN_DAYS * DAY_MS) { periods++; periodStart = t; }
    sum += v;
  }
  if (periods < MIN_PERIODS_PER_WINDOW) return { mean: null, fxMissing };
  return { mean: sum / periods, fxMissing };
}

/**
 * Nominal pay change: mean monthly salary of the last 12 months vs the 12 before
 * (or vs the user's manual "a year ago" figure when the prior window is thin).
 * Amounts are converted to the base currency; a row with no rate is excluded and
 * flags fxApproximate — it never counts as zero.
 */
export function nominalChange(input: {
  rows: IncomeRow[];
  salaryKey: string;
  now: Date;
  baseCurrency: string;
  convert: (amount: number, from: string) => number | null;
  manualPreviousMonthly: number | null;
}): { nominalChangePct: number | null; fxApproximate: boolean } {
  const eligible = input.rows.filter((r) => isSalaryEligible(r) && salaryKeyOf(r) === input.salaryKey);
  const mine = removeDuplicates(eligible);
  const end = input.now.getTime() + DAY_MS;
  const mid = end - 365 * DAY_MS;
  const start = mid - 365 * DAY_MS;

  const cur = windowMean(mine, mid, end, input.convert);
  const prev = windowMean(mine, start, mid, input.convert);
  const fxApproximate = cur.fxMissing || prev.fxMissing;

  const previous = prev.mean ?? (input.manualPreviousMonthly && input.manualPreviousMonthly > 0 ? input.manualPreviousMonthly : null);
  if (cur.mean === null || previous === null) return { nominalChangePct: null, fxApproximate };
  return { nominalChangePct: round1((cur.mean / previous - 1) * 100), fxApproximate };
}
