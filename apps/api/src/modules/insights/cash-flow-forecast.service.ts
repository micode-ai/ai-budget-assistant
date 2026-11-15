import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { CacheService } from '../../common/cache/cache.service';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import type { CashFlowForecastResponse } from '@budget/shared-types';
import {
  buildForecastSeries,
  detectMonthlyIncomeSeries,
  incomeOccurrences,
  isoDay,
  paysSubscription,
  recurringOccurrences,
  startOfDay,
  subscriptionOccurrences,
  type BillingCycle,
  type ForecastEvent,
} from './cash-flow-forecast.util';

export const FORECAST_DAYS = 30;
/** History used for income cadence and for the typical daily spend. */
const LOOKBACK_DAYS = 90;
/** Below this much spending history the daily estimate is not trusted. */
const MIN_HISTORY_DAYS = 14;
const CACHE_TTL_SEC = 300;

export function cashFlowForecastCacheKey(accountId: string, baseCurrency: string): string {
  return `cff:${accountId}:${baseCurrency}`;
}

/**
 * The next 30 days of the account's money, day by day: today's wallet balance,
 * plus the income the account reliably receives, minus the subscriptions and
 * recurring expenses already scheduled, minus a typical day of everyday
 * spending. Deterministic, no LLM, free on every tier.
 * See docs/wiki/features/cash-flow-forecast.md.
 */
@Injectable()
export class CashFlowForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly cacheService: CacheService,
  ) {}

  async getForecast(accountId: string, baseCurrency: string): Promise<CashFlowForecastResponse> {
    const key = cashFlowForecastCacheKey(accountId, baseCurrency);
    const cached = await this.cacheService.get<CashFlowForecastResponse>(key);
    if (cached) return cached;
    const result = await this.compute(accountId, baseCurrency, new Date());
    await this.cacheService.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  async compute(accountId: string, base: string, now: Date): Promise<CashFlowForecastResponse> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    // Fully encrypted amounts are unreadable here; a forecast from them would
    // be fiction, so none is produced (same gate as GET /insights).
    if ((account?.encryptionTier ?? 0) >= 2) {
      return { encryptionRestricted: true, baseCurrency: base } as CashFlowForecastResponse;
    }

    const today = startOfDay(now);
    const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + FORECAST_DAYS);
    const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - LOOKBACK_DAYS);
    const rates = await getRatesSafe(this.exchangeRateService, base);
    let fxApproximate = false;
    const toBase = (amount: number, currency: string): number | null => {
      const v = convertAmount(amount, currency, base, rates);
      if (currency !== base) fxApproximate = true;
      return v;
    };

    const [wallet, walletBalanceUnset, incomes, subs, recurring, recentSpend] = await Promise.all([
      this.walletService.getSummary(accountId),
      this.walletService.isBalanceUnset(accountId),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: { gte: since } },
        select: { amount: true, currencyCode: true, description: true, date: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.userSubscription.findMany({
        where: { accountId, isActive: true },
        select: { name: true, amount: true, currencyCode: true, billingCycle: true, nextRenewalDate: true, categoryId: true },
      }),
      this.prisma.expense.findMany({
        where: {
          accountId,
          isRecurring: true,
          isDeleted: false,
          ...EXCLUDE_SPLIT_RECEIVABLE,
          recurringId: { not: null },
          recurringPeriod: { not: null },
        },
        select: { recurringId: true, recurringPeriod: true, date: true, amount: true, currencyCode: true, description: true },
        orderBy: { date: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          isPlanned: false,
          ...EXCLUDE_SPLIT_RECEIVABLE,
          date: { gte: since, lt: today },
        },
        select: {
          amount: true,
          currencyCode: true,
          date: true,
          description: true,
          merchant: true,
          categoryId: true,
          recurringId: true,
          userSubscriptionId: true,
        },
      }),
    ]);

    // Planned purchases (approved purchase requests) and borrowed debts due
    // are money the user has committed to pay. Money OTHERS owe the user (lent
    // debts) is deliberately not assumed to come back — a forecast should not
    // lean on someone else's punctuality (ABA-775).
    const [planned, borrowedDue] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, isPlanned: true, ...EXCLUDE_SPLIT_RECEIVABLE, date: { lte: until } },
        select: { amount: true, currencyCode: true, date: true, description: true, merchant: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, isDebt: true, debtDueDate: { not: null, lte: until } },
        select: { id: true, amount: true, currencyCode: true, debtDueDate: true, debtContactName: true },
      }),
    ]);
    const repaid = new Map<string, number>();
    if (borrowedDue.length > 0) {
      const repayments = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          isDebtRepayment: true,
          relatedDebtIncomeId: { in: borrowedDue.map((d) => d.id) },
        },
        select: { relatedDebtIncomeId: true, amount: true },
      });
      for (const r of repayments) {
        if (!r.relatedDebtIncomeId) continue;
        repaid.set(r.relatedDebtIncomeId, (repaid.get(r.relatedDebtIncomeId) ?? 0) + Number(r.amount));
      }
    }

    let startBalance = 0;
    for (const b of wallet.balances) {
      const v = toBase(b.currentBalance, b.currencyCode);
      if (v === null) fxApproximate = true;
      else startBalance += v;
    }

    const events: ForecastEvent[] = [];
    for (const series of detectMonthlyIncomeSeries(incomes)) {
      const amount = toBase(series.amount, series.currencyCode);
      if (amount === null) continue;
      for (const date of incomeOccurrences(series, today, until)) {
        events.push({ date, kind: 'income', label: series.label, amount });
      }
    }
    for (const sub of subs) {
      const amount = toBase(Number(sub.amount), sub.currencyCode);
      if (amount === null) continue;
      for (const date of subscriptionOccurrences(new Date(sub.nextRenewalDate), sub.billingCycle as BillingCycle, today, until)) {
        events.push({ date, kind: 'subscription', label: sub.name, amount: -amount });
      }
    }
    const seenSeries = new Set<string>();
    for (const tpl of recurring) {
      if (!tpl.recurringId || seenSeries.has(tpl.recurringId)) continue;
      seenSeries.add(tpl.recurringId); // newest first: the first row is the template
      const amount = toBase(Number(tpl.amount), tpl.currencyCode);
      if (amount === null) continue;
      for (const date of recurringOccurrences(new Date(tpl.date), tpl.recurringPeriod as string, today, until)) {
        events.push({ date, kind: 'recurring', label: tpl.description ?? '', amount: -amount });
      }
    }

    // Anything already overdue is placed on today: still owed, still intended.
    const onOrAfterToday = (d: Date) => (d < today ? today : d);
    for (const p of planned) {
      const amount = toBase(Number(p.amount), p.currencyCode);
      if (amount === null) continue;
      events.push({
        date: onOrAfterToday(new Date(p.date)),
        kind: 'planned',
        label: p.description || p.merchant || '',
        amount: -amount,
      });
    }
    for (const debt of borrowedDue) {
      const remaining = Number(debt.amount) - (repaid.get(debt.id) ?? 0);
      if (remaining <= 0 || !debt.debtDueDate) continue;
      const amount = toBase(remaining, debt.currencyCode);
      if (amount === null) continue;
      events.push({
        date: onOrAfterToday(new Date(debt.debtDueDate)),
        kind: 'debt',
        label: debt.debtContactName ?? '',
        amount: -amount,
      });
    }

    // Typical everyday spending: the average day over the history window,
    // leaving out what is already scheduled above (recurring series and
    // subscription charges), or it would be subtracted twice.
    let historyDays = 0;
    let typicalDailySpend = 0;
    if (recentSpend.length > 0) {
      const first = recentSpend.reduce((m, e) => (e.date < m ? e.date : m), recentSpend[0].date);
      historyDays = Math.round((today.getTime() - startOfDay(first).getTime()) / 86_400_000);
      if (historyDays >= MIN_HISTORY_DAYS) {
        let total = 0;
        for (const e of recentSpend) {
          if (e.recurringId || e.userSubscriptionId || paysSubscription(e, subs)) continue;
          const v = toBase(Number(e.amount), e.currencyCode);
          if (v !== null) total += v;
        }
        typicalDailySpend = Math.round((total / historyDays) * 100) / 100;
      }
    }

    const series = buildForecastSeries(today, FORECAST_DAYS, startBalance, events, typicalDailySpend);
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      baseCurrency: base,
      startBalance: Math.round(startBalance * 100) / 100,
      typicalDailySpend,
      spendingHistoryShort: historyDays < MIN_HISTORY_DAYS,
      days: series.days,
      events: events.map((e) => ({
        date: isoDay(e.date),
        kind: e.kind,
        label: e.label,
        amount: Math.round(e.amount * 100) / 100,
      })),
      lowest: series.lowest,
      endBalance: series.endBalance,
      fxApproximate,
      walletBalanceUnset,
      computedAt: now.toISOString(),
    };
  }
}
