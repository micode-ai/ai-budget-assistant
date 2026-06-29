import { useEffect, useMemo } from 'react';
import { useInsightsStore } from '@/stores/insightsStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useWalletStore } from '@/stores/walletStore';
import { useGoalStore } from '@/stores/goalStore';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { computeSafeToSpend } from '@budget/shared-utils';
import type { SafeToSpendResponse } from '@budget/shared-types';

export interface UseSafeToSpendResult {
  data: SafeToSpendResponse | null;
  loading: boolean;
  hasEnoughData: boolean;
}

/**
 * Primary source: server response cached in insightsStore (MMKV-backed).
 * Offline fallback: locally approximated number from expenseStore / incomeStore /
 * walletStore / goalStore via computeSafeToSpend (subscriptions may be omitted).
 * Returns the server result when available; falls back to local approximation
 * with fxApproximate=true when the server result is absent or stale.
 *
 * Shape mirrors useFinancialHealthScore: { data, loading, hasEnoughData }.
 * Zero AI cost — fully deterministic.
 */
export function useSafeToSpend(): UseSafeToSpendResult {
  const { safeToSpend, safeToSpendLoading, loadSafeToSpend } = useInsightsStore();
  const { expenses } = useExpenseStore();
  const { incomes } = useIncomeStore();
  const { walletSummary } = useWalletStore();
  const { goals } = useGoalStore();
  const { user } = useAuthStore();
  const { rates } = useExchangeRateStore();

  // Load from server on mount
  useEffect(() => {
    loadSafeToSpend();
  }, [loadSafeToSpend]);

  // Offline fallback: approximate the formula locally when server data is absent
  const localFallback = useMemo<SafeToSpendResponse | null>(() => {
    if (safeToSpend) return null; // server data available — skip local computation

    const baseCurrency = user?.currencyCode ?? 'USD';
    const now = new Date();

    // Days remaining in current month (inclusive, min 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = Math.max(
      1,
      Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const horizonDate = endOfMonth.toISOString().slice(0, 10);

    // Wallet balance — sum all balances converted to base currency
    const walletBalance = walletSummary.reduce((sum, ws) => {
      return sum + convertAmount(ws.currentBalance, ws.currencyCode, baseCurrency, rates);
    }, 0);

    // Upcoming recurring expenses this month (rough: recurring flag + same month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const recurringThisMonth = expenses.filter((e) => {
      if (e.isDeleted || !e.isRecurring) return false;
      const d = new Date(e.date);
      return d >= monthStart && d <= endOfMonth;
    });
    const upcomingRecurring = recurringThisMonth.reduce(
      (sum, e) => sum + convertAmount(e.amount, e.currencyCode, baseCurrency, rates),
      0,
    );

    // Income inference: look for regular income this month
    const monthIncomes = incomes.filter((inc) => {
      if (inc.isDeleted) return false;
      const d = new Date(inc.date);
      return d >= monthStart && d <= endOfMonth;
    });
    const expectedIncome = monthIncomes.reduce(
      (sum, inc) => sum + convertAmount(inc.amount, inc.currencyCode, baseCurrency, rates),
      0,
    );
    const incomeInferred = expectedIncome > 0;

    // Goal contributions: active goals, prorated pace for remaining days
    const activeGoals = goals.filter((g) => g.status === 'active');
    const goalContributions = activeGoals.reduce((sum, g) => {
      const deadline = new Date(g.deadline);
      if (deadline <= now) return sum; // overdue — skip
      const remaining = g.targetAmount - g.currentAmount;
      if (remaining <= 0) return sum; // already met
      const totalDays = Math.max(
        1,
        Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const dailyNeeded = remaining / totalDays;
      const contribution = dailyNeeded * daysRemaining;
      return sum + convertAmount(contribution, g.currencyCode ?? baseCurrency, baseCurrency, rates);
    }, 0);

    const result = computeSafeToSpend({
      walletBalance,
      expectedIncome,
      upcomingSubscriptions: 0, // subscriptions not available offline
      upcomingRecurring,
      goalContributions,
      buffer: 0,
      daysRemaining,
    });

    const hasWalletData = walletSummary.length > 0;
    if (!hasWalletData) return null; // not enough data for a meaningful number

    return {
      baseCurrency,
      safeToSpendToday: result.safeToSpendToday,
      projectedAvailable: result.projectedAvailable,
      daysRemaining,
      horizonDate,
      incomeInferred,
      fxApproximate: true,
      breakdown: {
        walletBalance,
        expectedIncome,
        upcomingSubscriptions: 0,
        upcomingRecurring,
        goalContributions,
        buffer: 0,
      },
      computedAt: new Date().toISOString(),
    };
  }, [safeToSpend, user, walletSummary, expenses, incomes, goals, rates]);

  const data = safeToSpend ?? localFallback;
  const hasEnoughData = data !== null;

  return {
    data,
    loading: safeToSpendLoading,
    hasEnoughData,
  };
}
