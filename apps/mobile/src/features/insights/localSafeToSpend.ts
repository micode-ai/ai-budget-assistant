/**
 * The offline Safe-to-Spend inputs — pure, store-free.
 *
 * Only used when the app has NO server figure for the account (the server
 * response is cached per account in MMKV, so this is a cold, offline first
 * paint). It follows the server's `SafeToSpendService.computeUncached` step
 * for step, with the date rules from the shared-utils `cash-flow-dates` mirror,
 * so the number it shows is the one the server would show:
 *
 * - **Income** is an EXPECTED monthly payment still to come (cadence 25–35 days,
 *   next date today … end of month). It used to add income already received
 *   this month — money the wallet balance already holds, counted twice.
 * - **Horizon** is the earlier of the end of the month and that income date.
 * - **Recurring expenses** are FUTURE due dates of each series (after today,
 *   through the horizon). It used to subtract this month's already-paid ones —
 *   also already in the balance.
 * - **Subscriptions** are renewals today … horizon. They used to be left out.
 * - **Goals** reserve their linear daily pace for the days in the horizon.
 */
import {
  detectMonthlyIncomeSeries,
  financialMonth,
  isoDay,
  recurringOccurrences,
  subscriptionOccurrences,
  type BillingCycle,
} from '@budget/shared-utils';

const INCOME_LOOKBACK_DAYS = 90;

export interface LocalStsIncome {
  amount: number;
  currencyCode: string;
  description?: string | null;
  date: Date | string;
}

export interface LocalStsExpense {
  amount: number;
  currencyCode: string;
  date: Date | string;
  isRecurring?: boolean;
  recurringId?: string | null;
  recurringPeriod?: string | null;
}

export interface LocalStsSubscription {
  amount: number;
  currencyCode: string;
  billingCycle: string;
  nextRenewalDate: string | Date;
  isActive: boolean;
}

export interface LocalStsGoal {
  targetAmount: number;
  currentAmount: number;
  currencyCode?: string | null;
  deadline: string | Date;
  status: string;
}

export interface LocalStsInputs {
  expectedIncome: number;
  incomeInferred: boolean;
  horizonDate: string;
  daysRemaining: number;
  upcomingSubscriptions: number;
  upcomingRecurring: number;
  goalContributions: number;
}

type Convert = (amount: number, currencyCode: string) => number;

export function localSafeToSpendInputs(params: {
  now: Date;
  incomes: LocalStsIncome[];
  expenses: LocalStsExpense[];
  subscriptions: LocalStsSubscription[];
  goals: LocalStsGoal[];
  convert: Convert;
  /** The account's financial-month anchor; null = calendar month (ABA-789). */
  anchorDay?: number | null;
}): LocalStsInputs {
  const { now, convert } = params;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // End of the account's (financial) month — same horizon as the server (ABA-789).
  const endOfMonth = financialMonth(now, params.anchorDay ?? null).end;

  // Income: the largest monthly series whose next payment is still ahead this month.
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - INCOME_LOOKBACK_DAYS);
  const recentIncomes = params.incomes
    .map((i) => ({ ...i, date: new Date(i.date) }))
    .filter((i) => i.date >= since)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  let expectedIncome = 0;
  let nextIncome: Date | null = null;
  for (const series of detectMonthlyIncomeSeries(recentIncomes)) {
    const next = new Date(series.lastDate.getTime() + series.avgGapMs);
    if (next > endOfMonth || next < now) continue;
    const amount = convert(series.amount, series.currencyCode);
    if (amount > expectedIncome) {
      expectedIncome = amount;
      nextIncome = next;
    }
  }

  const horizon = nextIncome && nextIncome < endOfMonth ? nextIncome : endOfMonth;
  const horizonMidnight = new Date(horizon.getFullYear(), horizon.getMonth(), horizon.getDate());
  const daysRemaining = Math.max(1, Math.round((horizonMidnight.getTime() - today.getTime()) / 86_400_000) + 1);

  let upcomingSubscriptions = 0;
  for (const sub of params.subscriptions) {
    if (!sub.isActive) continue;
    const count = subscriptionOccurrences(new Date(sub.nextRenewalDate), sub.billingCycle as BillingCycle, today, horizon).length;
    upcomingSubscriptions += count * convert(sub.amount, sub.currencyCode);
  }

  // Newest instance per recurring series is the template, as on the server.
  const templates = new Map<string, LocalStsExpense & { date: Date }>();
  for (const e of params.expenses) {
    if (!e.isRecurring || !e.recurringId || !e.recurringPeriod) continue;
    const d = new Date(e.date);
    const prev = templates.get(e.recurringId);
    if (!prev || d > prev.date) templates.set(e.recurringId, { ...e, date: d });
  }
  let upcomingRecurring = 0;
  for (const tpl of templates.values()) {
    const count = recurringOccurrences(tpl.date, tpl.recurringPeriod as string, today, horizon).length;
    upcomingRecurring += count * convert(tpl.amount, tpl.currencyCode);
  }

  let goalContributions = 0;
  for (const g of params.goals) {
    if (g.status !== 'active') continue;
    const remaining = g.targetAmount - g.currentAmount;
    const msLeft = new Date(g.deadline).getTime() - now.getTime();
    if (remaining <= 0 || msLeft <= 0) continue;
    const dailyPace = remaining / (msLeft / 86_400_000);
    goalContributions += convert(dailyPace * daysRemaining, g.currencyCode ?? '');
  }

  return {
    expectedIncome: Math.round(expectedIncome * 100) / 100,
    incomeInferred: expectedIncome > 0,
    horizonDate: isoDay(horizon),
    daysRemaining,
    upcomingSubscriptions: Math.round(upcomingSubscriptions * 100) / 100,
    upcomingRecurring: Math.round(upcomingRecurring * 100) / 100,
    goalContributions: Math.round(goalContributions * 100) / 100,
  };
}
