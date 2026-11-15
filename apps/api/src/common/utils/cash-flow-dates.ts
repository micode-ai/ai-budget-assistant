/**
 * When known future money movements fall: subscription renewals, recurring
 * expense due dates, and the expected dates of a monthly income. Pure.
 *
 * MIRROR: packages/shared-utils/src/formatting/cash-flow-dates.ts holds an
 * identical copy (everything after this comment) for the app's offline
 * Safe-to-Spend. The API cannot import shared-utils at runtime (ABA-252/253),
 * so the duplication is deliberate; `cashFlowDatesParity.test.ts` in the app
 * fails if the two bodies drift. Change both together.
 */

export type BillingCycle = 'monthly' | 'yearly' | 'quarterly' | 'weekly';

const DAY_MS = 24 * 60 * 60 * 1000;

export function addCycle(date: Date, cycle: BillingCycle): Date {
  const next = new Date(date);
  switch (cycle) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/** Recurring-expense period step; mirror of `addPeriod` in expense-recurring.cron.ts. */
export function addPeriod(date: Date, period: string): Date {
  const next = new Date(date);
  if (period === 'weekly') next.setDate(next.getDate() + 7);
  else if (period === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (period === 'yearly') next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Renewal dates of a subscription in [today, until]: an overdue
 * `nextRenewalDate` is walked forward to today first (a renewal due today counts).
 */
export function subscriptionOccurrences(nextRenewalDate: Date, cycle: BillingCycle, today: Date, until: Date): Date[] {
  let current = new Date(nextRenewalDate);
  while (current < today) current = addCycle(current, cycle);
  const out: Date[] = [];
  while (current <= until) {
    out.push(current);
    current = addCycle(current, cycle);
  }
  return out;
}

/**
 * Due dates of a recurring-expense series in (today, until], from its latest
 * instance: today's instance is assumed already booked by the 08:00 cron.
 */
export function recurringOccurrences(latestDate: Date, period: string, today: Date, until: Date): Date[] {
  let current = addPeriod(new Date(latestDate), period);
  while (current <= today) current = addPeriod(current, period);
  const out: Date[] = [];
  while (current <= until) {
    out.push(current);
    current = addPeriod(current, period);
  }
  return out;
}

// Gap range that signals a monthly cadence (matches anomaly's recurring_suggestion).
export const MONTHLY_GAP_MIN = 25;
export const MONTHLY_GAP_MAX = 35;
export const MIN_OCCURRENCES = 2;

export interface IncomeRow {
  amount: unknown;
  currencyCode: string;
  description?: string | null;
  date: Date;
}

export interface MonthlyIncomeSeries {
  /** Normalised description, for labelling. */
  label: string;
  amount: number;
  currencyCode: string;
  lastDate: Date;
  avgGapMs: number;
}

/**
 * Income series with a monthly cadence: grouped by normalised description +
 * amount rounded to 10 + currency, at least two occurrences, every gap 25–35
 * days. `incomes` must be sorted by date ascending.
 */
export function detectMonthlyIncomeSeries(incomes: IncomeRow[]): MonthlyIncomeSeries[] {
  const groups = new Map<string, { label: string; dates: Date[]; amount: number; currencyCode: string }>();
  for (const inc of incomes) {
    const amt = Number(inc.amount);
    const bucket = Math.round(amt / 10) * 10;
    const label = (inc.description || '').trim().toLowerCase();
    const key = `${label}|${bucket}|${inc.currencyCode}`;
    if (!groups.has(key)) groups.set(key, { label: (inc.description || '').trim(), dates: [], amount: amt, currencyCode: inc.currencyCode });
    groups.get(key)!.dates.push(new Date(inc.date));
  }

  const series: MonthlyIncomeSeries[] = [];
  for (const g of groups.values()) {
    if (g.dates.length < MIN_OCCURRENCES) continue;
    let monthly = true;
    for (let i = 1; i < g.dates.length; i++) {
      const gap = (g.dates[i].getTime() - g.dates[i - 1].getTime()) / DAY_MS;
      if (gap < MONTHLY_GAP_MIN || gap > MONTHLY_GAP_MAX) {
        monthly = false;
        break;
      }
    }
    if (!monthly) continue;
    const last = g.dates[g.dates.length - 1];
    series.push({
      label: g.label,
      amount: g.amount,
      currencyCode: g.currencyCode,
      lastDate: last,
      avgGapMs: (last.getTime() - g.dates[0].getTime()) / (g.dates.length - 1),
    });
  }
  return series;
}

/** Expected dates of a monthly income series in [today, until]. */
export function incomeOccurrences(series: MonthlyIncomeSeries, today: Date, until: Date): Date[] {
  const out: Date[] = [];
  let current = new Date(series.lastDate.getTime() + series.avgGapMs);
  // An expected payment that is already overdue is not assumed to still come.
  while (current < today) current = new Date(current.getTime() + series.avgGapMs);
  while (current <= until) {
    out.push(current);
    current = new Date(current.getTime() + series.avgGapMs);
  }
  return out;
}
