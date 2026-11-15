/**
 * Pure building blocks shared by Safe-to-Spend and the 30-day cash-flow
 * forecast: when the known future money movements fall, and how a day-by-day
 * balance follows from them. No Prisma, no DI — unit-tested directly.
 *
 * Safe-to-Spend SUMS these events up to its horizon; the forecast PLACES them
 * on days. Keeping the date rules here means the two can never disagree on
 * when a subscription renews or a salary is expected.
 */

export {
  addCycle,
  addPeriod,
  startOfDay,
  isoDay,
  subscriptionOccurrences,
  recurringOccurrences,
  MONTHLY_GAP_MIN,
  MONTHLY_GAP_MAX,
  MIN_OCCURRENCES,
  detectMonthlyIncomeSeries,
  incomeOccurrences,
} from '../../common/utils/cash-flow-dates';
export type { BillingCycle, IncomeRow, MonthlyIncomeSeries } from '../../common/utils/cash-flow-dates';
import { isoDay } from '../../common/utils/cash-flow-dates';

export type ForecastEventKind = 'income' | 'subscription' | 'recurring' | 'planned' | 'debt';

export interface ForecastEvent {
  date: Date;
  kind: ForecastEventKind;
  label: string;
  /** Signed, base currency: income positive, charges negative. */
  amount: number;
}

export interface ForecastDay {
  date: string;
  balance: number;
  scheduled: number;
}

export interface ForecastSeries {
  days: ForecastDay[];
  lowest: { date: string; balance: number };
  endBalance: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Day-by-day balance from today through today + `horizonDays`.
 * Day 0 (today) carries only today's scheduled events: the wallet balance
 * already includes what was spent today. Every later day also subtracts
 * `typicalDailySpend`.
 */
export function buildForecastSeries(
  today: Date,
  horizonDays: number,
  startBalance: number,
  events: ForecastEvent[],
  typicalDailySpend: number,
): ForecastSeries {
  const byDay = new Map<string, number>();
  for (const e of events) {
    const key = isoDay(e.date);
    byDay.set(key, (byDay.get(key) ?? 0) + e.amount);
  }

  const days: ForecastDay[] = [];
  let balance = startBalance;
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const key = isoDay(d);
    const scheduled = byDay.get(key) ?? 0;
    balance += scheduled - (i === 0 ? 0 : typicalDailySpend);
    days.push({ date: key, balance: r2(balance), scheduled: r2(scheduled) });
  }

  let lowest = days[0];
  for (const d of days) if (d.balance < lowest.balance) lowest = d;
  return {
    days,
    lowest: { date: lowest.date, balance: lowest.balance },
    endBalance: days[days.length - 1].balance,
  };
}

export interface SpendRow {
  amount: unknown;
  currencyCode: string;
  date: Date;
  description?: string | null;
  merchant?: string | null;
  categoryId?: string | null;
  recurringId?: string | null;
}

export interface SubscriptionRow {
  name: string;
  amount: unknown;
  currencyCode: string;
  categoryId?: string | null;
}

/**
 * Does this expense pay for one of the active subscriptions? Same rule as the
 * app's fixed-vs-flexible card (`apps/mobile/src/features/analytics/cashFlow.ts`
 * `matchSubscription`): same name in description or merchant, or same
 * category + currency with an amount within 1%. Keep the two in step.
 */
export function paysSubscription(e: SpendRow, subs: SubscriptionRow[]): boolean {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
  const names = [norm(e.description), norm(e.merchant)].filter(Boolean);
  const amount = Number(e.amount);
  return subs.some((s) => {
    if (names.includes(norm(s.name))) return true;
    const subAmount = Number(s.amount);
    return (
      !!s.categoryId &&
      s.categoryId === e.categoryId &&
      s.currencyCode === e.currencyCode &&
      subAmount > 0 &&
      Math.abs(amount - subAmount) <= subAmount * 0.01
    );
  });
}
