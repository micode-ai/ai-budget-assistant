import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { CacheService } from '../../common/cache/cache.service';
import { computeSafeToSpend } from '@budget/shared-utils';
import type { SafeToSpendResponse, AffordabilityVerdict } from '@budget/shared-types';

// How far back we look when inferring monthly income (90 days)
const INCOME_LOOKBACK_DAYS = 90;
// Gap range that signals a monthly cadence (matches anomaly module's recurring_suggestion)
const MONTHLY_GAP_MIN = 25;
const MONTHLY_GAP_MAX = 35;
// Minimum occurrences to establish a recurring income series
const MIN_OCCURRENCES = 2;
// Cache TTL for safe-to-spend results (5 minutes)
const CACHE_TTL_SEC = 300;

type BillingCycle = 'monthly' | 'yearly' | 'quarterly' | 'weekly';

/**
 * Returns the cache key for a safe-to-spend result.
 * Per-user key because base currency is per-user (same reasoning as ai-tools buildToolCacheKey).
 */
export function safeToSpendCacheKey(accountId: string, baseCurrency: string): string {
  return `sts:${accountId}:${baseCurrency}`;
}

/**
 * Advance a Date by one billing cycle.
 * Mirror of the `addCycle` logic in subscription-renewal.cron.ts.
 */
function addCycle(date: Date, cycle: BillingCycle): Date {
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

/**
 * Advance a Date by one recurring-expense period.
 * Mirror of `addPeriod` in expense-recurring.cron.ts.
 */
function addPeriod(date: Date, period: string): Date {
  const next = new Date(date);
  if (period === 'weekly') next.setDate(next.getDate() + 7);
  else if (period === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (period === 'yearly') next.setFullYear(next.getFullYear() + 1);
  return next;
}

@Injectable()
export class SafeToSpendService {
  private readonly logger = new Logger(SafeToSpendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Fetch exchange rates for `base`. Returns null when unavailable (caller falls back to native amounts).
   * Pattern mirrors AiToolsService.getRatesSafe (ai-tools.service.ts:37-45).
   */
  private async getRatesSafe(base: string): Promise<Record<string, number> | null> {
    try {
      const { rates } = await this.exchangeRateService.getRates(base);
      return rates || null;
    } catch {
      return null;
    }
  }

  /**
   * Convert `amount` from `from` currency to `base`.
   * Returns null when the rate is unknown (caller excludes the amount and sets fxApproximate).
   * Pattern mirrors AiToolsService.convertAmount (ai-tools.service.ts:47-53).
   */
  private convertAmount(
    amount: number,
    from: string,
    base: string,
    rates: Record<string, number>,
  ): number | null {
    if (from === base) return amount;
    const r = rates[from];
    if (!r || r <= 0) return null;
    return Math.round((amount / r) * 100) / 100;
  }

  /**
   * Returns the ISO date string for the last day of the current month (today's month).
   */
  private endOfMonth(now: Date): Date {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  /**
   * Count calendar days from today (inclusive) to `horizon` (inclusive), min 1.
   */
  private daysUntil(horizon: Date, now: Date): number {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const horizonMidnight = new Date(horizon.getFullYear(), horizon.getMonth(), horizon.getDate());
    const diff = Math.round((horizonMidnight.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, diff + 1); // +1 = today counts
  }

  /**
   * Income inference: look back INCOME_LOOKBACK_DAYS, group by normalized description +
   * amount bucket, detect a monthly cadence (gaps 25–35 d, ≥ 2 occurrences).
   * Returns { expectedIncome, nextDate } when confident, else { expectedIncome: 0, nextDate: null }.
   *
   * Uses the same heuristic as the anomaly module's recurring_suggestion detector.
   */
  private async inferMonthlyIncome(
    accountId: string,
    base: string,
    rates: Record<string, number> | null,
    endOfCurrentMonth: Date,
    now: Date,
  ): Promise<{ expectedIncome: number; nextDate: Date | null; fxApproximate: boolean }> {
    const since = new Date(now);
    since.setDate(since.getDate() - INCOME_LOOKBACK_DAYS);

    const incomes = await this.prisma.income.findMany({
      where: { accountId, isDeleted: false, date: { gte: since } },
      select: { amount: true, currencyCode: true, description: true, date: true },
      orderBy: { date: 'asc' },
    });

    if (incomes.length < MIN_OCCURRENCES) {
      return { expectedIncome: 0, nextDate: null, fxApproximate: false };
    }

    // Group by normalized description + rounded-amount bucket (same currency)
    // bucket = round(amount, -1) so small float fluctuations don't split series
    type Group = { dates: Date[]; amount: number; currencyCode: string };
    const groups = new Map<string, Group>();

    for (const inc of incomes) {
      const amt = Number(inc.amount);
      const bucket = Math.round(amt / 10) * 10;
      const key = `${(inc.description || '').trim().toLowerCase()}|${bucket}|${inc.currencyCode}`;
      if (!groups.has(key)) {
        groups.set(key, { dates: [], amount: amt, currencyCode: inc.currencyCode });
      }
      groups.get(key)!.dates.push(new Date(inc.date));
    }

    let bestExpected = 0;
    let bestNextDate: Date | null = null;
    let fxApproximate = false;

    for (const group of groups.values()) {
      const { dates, amount, currencyCode } = group;
      if (dates.length < MIN_OCCURRENCES) continue;

      // Check gaps between consecutive dates
      let allMonthly = true;
      for (let i = 1; i < dates.length; i++) {
        const gap = (dates[i].getTime() - dates[i - 1].getTime()) / (24 * 60 * 60 * 1000);
        if (gap < MONTHLY_GAP_MIN || gap > MONTHLY_GAP_MAX) {
          allMonthly = false;
          break;
        }
      }
      if (!allMonthly) continue;

      // Predict next occurrence: lastDate + avg gap
      const lastDate = dates[dates.length - 1];
      const avgGapMs =
        (dates[dates.length - 1].getTime() - dates[0].getTime()) / (dates.length - 1);
      const nextDate = new Date(lastDate.getTime() + avgGapMs);

      // Only use this series if the next occurrence is before or on end of current month
      if (nextDate > endOfCurrentMonth) continue;
      // Must be in the future (or today)
      if (nextDate < now) continue;

      // Convert amount to base
      let converted: number | null = amount;
      if (rates && currencyCode !== base) {
        converted = this.convertAmount(amount, currencyCode, base, rates);
        if (converted != null) {
          fxApproximate = true;
        } else {
          // Rate unavailable — skip this series conservatively
          continue;
        }
      } else if (!rates && currencyCode !== base) {
        // No rates at all — skip
        continue;
      }

      if (converted != null && converted > bestExpected) {
        bestExpected = converted;
        bestNextDate = nextDate;
      }
    }

    return {
      expectedIncome: Math.round(bestExpected * 100) / 100,
      nextDate: bestNextDate,
      fxApproximate,
    };
  }

  /**
   * Sum upcoming subscription charges between now and horizon (exclusive now, inclusive horizon).
   * Weekly subscriptions may appear 2–4× in a month-long window.
   */
  private async sumUpcomingSubscriptions(
    accountId: string,
    horizon: Date,
    base: string,
    rates: Record<string, number> | null,
    now: Date,
  ): Promise<{ total: number; fxApproximate: boolean }> {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const subs = await this.prisma.userSubscription.findMany({
      where: { accountId, isActive: true },
      select: { amount: true, currencyCode: true, billingCycle: true, nextRenewalDate: true },
    });

    let total = 0;
    let fxApproximate = false;

    for (const sub of subs) {
      const amount = Number(sub.amount);
      const cycle = sub.billingCycle as BillingCycle;

      // Convert once; if unavailable, skip this subscription
      let convertedAmount: number | null = amount;
      if (rates && sub.currencyCode !== base) {
        convertedAmount = this.convertAmount(amount, sub.currencyCode, base, rates);
        if (convertedAmount != null) {
          fxApproximate = true;
        } else {
          continue;
        }
      } else if (!rates && sub.currencyCode !== base) {
        continue;
      }

      // Walk nextRenewalDate forward, counting occurrences within (today, horizon]
      let nextDate = new Date(sub.nextRenewalDate);
      // If the renewal is before today, advance until it's in range
      while (nextDate < today) {
        nextDate = addCycle(nextDate, cycle);
      }

      // Count all occurrences in the horizon window
      let current = new Date(nextDate);
      while (current <= horizon) {
        total += convertedAmount!;
        current = addCycle(current, cycle);
      }
    }

    return { total: Math.round(total * 100) / 100, fxApproximate };
  }

  /**
   * Sum upcoming recurring expense charges between now and horizon.
   * Mirrors the grouping in expense-recurring.cron.ts (latest per recurringId, then addPeriod).
   */
  private async sumUpcomingRecurring(
    accountId: string,
    horizon: Date,
    base: string,
    rates: Record<string, number> | null,
    now: Date,
  ): Promise<{ total: number; fxApproximate: boolean }> {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allRecurring = await this.prisma.expense.findMany({
      where: {
        accountId,
        isRecurring: true,
        isDeleted: false,
        recurringId: { not: null },
        recurringPeriod: { not: null },
      },
      select: {
        recurringId: true,
        recurringPeriod: true,
        date: true,
        amount: true,
        currencyCode: true,
      },
      orderBy: { date: 'desc' },
    });

    // Group by recurringId: keep only the latest per series
    const latestByRecurringId = new Map<string, typeof allRecurring[number]>();
    for (const exp of allRecurring) {
      if (!exp.recurringId) continue;
      if (!latestByRecurringId.has(exp.recurringId)) {
        latestByRecurringId.set(exp.recurringId, exp);
      }
    }

    let total = 0;
    let fxApproximate = false;

    for (const [, template] of latestByRecurringId) {
      const period = template.recurringPeriod as string;
      const amount = Number(template.amount);

      let convertedAmount: number | null = amount;
      if (rates && template.currencyCode !== base) {
        convertedAmount = this.convertAmount(amount, template.currencyCode, base, rates);
        if (convertedAmount != null) {
          fxApproximate = true;
        } else {
          continue;
        }
      } else if (!rates && template.currencyCode !== base) {
        continue;
      }

      // Advance nextDue until it's strictly after today
      let nextDue = addPeriod(new Date(template.date), period);
      while (nextDue <= today) {
        nextDue = addPeriod(nextDue, period);
      }

      // Count all occurrences ≤ horizon
      let current = new Date(nextDue);
      while (current <= horizon) {
        total += convertedAmount!;
        current = addPeriod(current, period);
      }
    }

    return { total: Math.round(total * 100) / 100, fxApproximate };
  }

  /**
   * Sum goal contributions required between now and horizon.
   * Linear pace: (targetAmount − currentAmount) / monthsLeft, prorated to daysRemaining.
   * A goal past its deadline or already met contributes 0.
   * Mirrors the model in useFinancialHealthScore.ts:104.
   */
  private async sumGoalContributions(
    accountId: string,
    daysRemaining: number,
    base: string,
    rates: Record<string, number> | null,
    now: Date,
  ): Promise<{ total: number; fxApproximate: boolean; goals: Array<{ id: string; name: string; currencyCode: string; remaining: number; monthsLeft: number; dailyPace: number; convertedDailyPace: number }> }> {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { accountId, status: 'active' },
      select: {
        id: true,
        name: true,
        targetAmount: true,
        currentAmount: true,
        currencyCode: true,
        deadline: true,
      },
    });

    let total = 0;
    let fxApproximate = false;
    const goalDetails: Array<{ id: string; name: string; currencyCode: string; remaining: number; monthsLeft: number; dailyPace: number; convertedDailyPace: number }> = [];

    for (const goal of goals) {
      const target = Number(goal.targetAmount);
      const current = Number(goal.currentAmount);
      const remaining = target - current;
      if (remaining <= 0) continue; // already met

      const deadline = new Date(goal.deadline);
      const msLeft = deadline.getTime() - now.getTime();
      if (msLeft <= 0) continue; // past deadline

      const daysLeft = msLeft / (24 * 60 * 60 * 1000);
      const monthsLeft = daysLeft / 30;
      if (monthsLeft <= 0) continue;

      // Daily pace in native currency
      const dailyPace = remaining / daysLeft;
      // Contribution due in the horizon window
      const dueDuringHorizon = dailyPace * daysRemaining;

      let convertedDue: number | null = dueDuringHorizon;
      if (rates && goal.currencyCode !== base) {
        convertedDue = this.convertAmount(dueDuringHorizon, goal.currencyCode, base, rates);
        if (convertedDue != null) {
          fxApproximate = true;
        } else {
          continue;
        }
      } else if (!rates && goal.currencyCode !== base) {
        continue;
      }

      const convertedDailyPace = convertedDue! / daysRemaining;
      total += convertedDue!;
      goalDetails.push({
        id: goal.id,
        name: goal.name,
        currencyCode: goal.currencyCode,
        remaining,
        monthsLeft,
        dailyPace,
        convertedDailyPace,
      });
    }

    return { total: Math.round(total * 100) / 100, fxApproximate, goals: goalDetails };
  }

  /**
   * Main computation entry point.
   * Checks Redis cache first (TTL 300s), then computes from Prisma.
   */
  async compute(
    accountId: string,
    _userId: string,
    baseCurrency: string,
  ): Promise<SafeToSpendResponse> {
    const cacheKey = safeToSpendCacheKey(accountId, baseCurrency);
    const cached = await this.cacheService.get<SafeToSpendResponse>(cacheKey);
    if (cached) {
      this.logger.log(`[sts] cache hit ${cacheKey}`);
      return cached;
    }

    const result = await this.computeUncached(accountId, baseCurrency);
    await this.cacheService.set(cacheKey, result, CACHE_TTL_SEC);
    return result;
  }

  private async computeUncached(accountId: string, baseCurrency: string): Promise<SafeToSpendResponse> {
    const now = new Date();
    const rates = await this.getRatesSafe(baseCurrency);
    let fxApproximate = false;

    // --- Wallet balances ---
    const walletSummary = await this.walletService.getSummary(accountId);
    let walletBalance = 0;
    for (const bal of walletSummary.balances) {
      const b = bal.currentBalance;
      if (bal.currencyCode === baseCurrency) {
        walletBalance += b;
      } else if (rates) {
        const conv = this.convertAmount(b, bal.currencyCode, baseCurrency, rates);
        if (conv != null) {
          walletBalance += conv;
          fxApproximate = true;
        }
        // If rate unknown, exclude that currency and flag
        else {
          fxApproximate = true;
        }
      } else {
        // No rates available — exclude non-base balances
        fxApproximate = true;
      }
    }
    walletBalance = Math.round(walletBalance * 100) / 100;

    // --- Horizon: default = end of current month ---
    const endOfCurrentMonth = this.endOfMonth(now);

    // --- Income inference ---
    const incomeInference = await this.inferMonthlyIncome(accountId, baseCurrency, rates, endOfCurrentMonth, now);
    if (incomeInference.fxApproximate) fxApproximate = true;

    // Horizon: min(end-of-month, nextExpectedIncomeDate) if confident income found
    let horizonDate: Date;
    let incomeInferred = false;
    let expectedIncome = 0;

    if (incomeInference.nextDate && incomeInference.expectedIncome > 0) {
      horizonDate = incomeInference.nextDate < endOfCurrentMonth
        ? incomeInference.nextDate
        : endOfCurrentMonth;
      incomeInferred = true;
      expectedIncome = incomeInference.expectedIncome;
    } else {
      horizonDate = endOfCurrentMonth;
      incomeInferred = false;
      expectedIncome = 0;
    }

    const daysRemaining = this.daysUntil(horizonDate, now);

    // --- Upcoming subscriptions ---
    const subResult = await this.sumUpcomingSubscriptions(accountId, horizonDate, baseCurrency, rates, now);
    if (subResult.fxApproximate) fxApproximate = true;

    // --- Upcoming recurring expenses ---
    const recurResult = await this.sumUpcomingRecurring(accountId, horizonDate, baseCurrency, rates, now);
    if (recurResult.fxApproximate) fxApproximate = true;

    // --- Goal contributions ---
    const goalResult = await this.sumGoalContributions(accountId, daysRemaining, baseCurrency, rates, now);
    if (goalResult.fxApproximate) fxApproximate = true;

    // --- Formula ---
    const formulaResult = computeSafeToSpend({
      walletBalance,
      expectedIncome,
      upcomingSubscriptions: subResult.total,
      upcomingRecurring: recurResult.total,
      goalContributions: goalResult.total,
      buffer: 0,
      daysRemaining,
    });

    const horizonIso = `${horizonDate.getFullYear()}-${String(horizonDate.getMonth() + 1).padStart(2, '0')}-${String(horizonDate.getDate()).padStart(2, '0')}`;

    const response: SafeToSpendResponse = {
      baseCurrency,
      safeToSpendToday: formulaResult.safeToSpendToday,
      projectedAvailable: formulaResult.projectedAvailable,
      daysRemaining,
      horizonDate: horizonIso,
      incomeInferred,
      fxApproximate,
      breakdown: {
        walletBalance,
        expectedIncome,
        upcomingSubscriptions: subResult.total,
        upcomingRecurring: recurResult.total,
        goalContributions: goalResult.total,
        buffer: 0,
      },
      computedAt: now.toISOString(),
    };

    return response;
  }

  /**
   * Affordability verdict: deterministic YES/NO for "can I afford X for N?".
   * Delegates to compute() for the cashflow engine, then applies the verdict logic.
   */
  async checkAffordability(
    accountId: string,
    userId: string,
    baseCurrency: string,
    amount: number,
    currencyCode: string,
  ): Promise<AffordabilityVerdict> {
    const sts = await this.compute(accountId, userId, baseCurrency);
    const rates = await this.getRatesSafe(baseCurrency);

    // Convert the asked amount to base currency
    let amountInBase = amount;
    if (currencyCode !== baseCurrency) {
      if (rates) {
        const conv = this.convertAmount(amount, currencyCode, baseCurrency, rates);
        amountInBase = conv ?? amount; // graceful: use native if rate unavailable
      }
      // else keep native as fallback
    }
    amountInBase = Math.round(amountInBase * 100) / 100;

    const { safeToSpendToday, projectedAvailable } = sts;

    // Determine primary verdict
    let affordable: boolean;
    let reasonCode: AffordabilityVerdict['reasonCode'];
    let goalImpact: AffordabilityVerdict['goalImpact'] | undefined;
    let suggestedDate: string | undefined;

    if (amountInBase <= safeToSpendToday) {
      // Comfortably within today's safe allowance
      affordable = true;
      reasonCode = 'within_safe';
    } else if (amountInBase <= projectedAvailable && projectedAvailable > 0) {
      // Affordable from total available, but eats into buffer/obligations
      affordable = true;
      reasonCode = 'within_available_tight';
    } else if (projectedAvailable <= 0 || amountInBase > projectedAvailable) {
      // Exceeds what's projected to be available
      if (sts.incomeInferred && sts.breakdown.expectedIncome > 0) {
        // Check if affordable AFTER income arrives
        const availableAfterIncome = projectedAvailable + sts.breakdown.expectedIncome;
        if (amountInBase <= availableAfterIncome) {
          affordable = false;
          reasonCode = 'wait_until_income';
          suggestedDate = sts.horizonDate;
        } else {
          affordable = false;
          reasonCode = 'over_available';
        }
      } else {
        affordable = false;
        reasonCode = 'over_available';
      }
    } else {
      affordable = false;
      reasonCode = 'over_available';
    }

    // If affordable via within_safe, check for goal impact using goal details
    // We need the goal details — re-run goal computation to get them for slip calculation
    if (affordable && (reasonCode === 'within_safe' || reasonCode === 'within_available_tight')) {
      const now = new Date();
      const goalDetailResult = await this.getGoalDetailsForAffordability(
        accountId,
        baseCurrency,
        rates,
        amountInBase,
        sts.daysRemaining,
        now,
      );
      if (goalDetailResult) {
        affordable = true;
        reasonCode = 'delays_goal';
        goalImpact = goalDetailResult;
      }
    }

    return {
      affordable,
      amount,
      currencyCode,
      safeToSpendToday,
      amountInBase,
      reasonCode,
      goalImpact,
      suggestedDate,
      baseCurrency,
    };
  }

  /**
   * Check whether making a purchase of `amountInBase` pushes any goal off-track.
   * Returns the worst-affected goal's name and slip in days, or null if no impact.
   * "Off-track" = the goal's daily pace after subtracting `amountInBase` is insufficient
   * to reach target by deadline.
   */
  private async getGoalDetailsForAffordability(
    accountId: string,
    base: string,
    rates: Record<string, number> | null,
    amountInBase: number,
    daysRemaining: number,
    now: Date,
  ): Promise<{ goalName: string; slipDays: number } | null> {
    const goalResult = await this.sumGoalContributions(accountId, daysRemaining, base, rates, now);
    if (goalResult.goals.length === 0) return null;

    // The purchase reduces available balance by amountInBase.
    // Check if any goal's daily pace becomes negative after subtracting the purchase cost.
    let worstSlipDays = 0;
    let worstGoalName = '';

    for (const goal of goalResult.goals) {
      if (goal.convertedDailyPace <= 0 || goal.monthsLeft <= 0) continue;

      // Without the purchase, the remaining available per day is safeToSpendToday.
      // With the purchase, we lose amountInBase spread over daysRemaining.
      const purchaseDailyDrain = amountInBase / Math.max(1, daysRemaining);
      const newDailyPace = goal.convertedDailyPace - purchaseDailyDrain;

      if (newDailyPace >= goal.convertedDailyPace) continue; // purchase doesn't affect pace

      const daysLeft = goal.monthsLeft * 30;
      // Original days needed = remaining / dailyPace
      const originalDaysNeeded = daysLeft; // on-track by definition
      // New days needed = remaining / newDailyPace
      const newDailyPaceNative = goal.dailyPace - (purchaseDailyDrain * (goal.remaining / Math.max(1, goal.convertedDailyPace * daysRemaining)));
      if (newDailyPaceNative <= 0) {
        // Goal becomes completely infeasible — large slip
        const slipDays = Math.ceil(daysLeft);
        if (slipDays > worstSlipDays) {
          worstSlipDays = slipDays;
          worstGoalName = goal.name;
        }
        continue;
      }

      const newDaysNeeded = goal.remaining / newDailyPaceNative;
      const slipDays = Math.max(0, Math.ceil(newDaysNeeded - originalDaysNeeded));
      if (slipDays > 0 && slipDays > worstSlipDays) {
        worstSlipDays = slipDays;
        worstGoalName = goal.name;
      }
    }

    if (worstSlipDays > 0 && worstGoalName) {
      return { goalName: worstGoalName, slipDays: worstSlipDays };
    }
    return null;
  }
}
