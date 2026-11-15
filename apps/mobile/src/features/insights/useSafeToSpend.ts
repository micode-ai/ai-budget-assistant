import { useEffect, useMemo } from 'react';
import { useInsightsStore } from '@/stores/insightsStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useWalletStore } from '@/stores/walletStore';
import { useGoalStore } from '@/stores/goalStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { useUserSubscriptionStore, readCachedSubscriptions } from '@/stores/userSubscriptionStore';
import { localSafeToSpendInputs } from './localSafeToSpend';
import { computeSafeToSpend } from '@budget/shared-utils';
import { filterConsumption, filterIncomeConsumption } from '@/utils/consumption';
import type { SafeToSpendResponse } from '@budget/shared-types';

export interface UseSafeToSpendResult {
  data: SafeToSpendResponse | null;
  loading: boolean;
  hasEnoughData: boolean;
}

/**
 * Primary source: server response cached in insightsStore (MMKV-backed).
 * Offline fallback: the same number computed on the device from the stores, by
 * the server's own rules (localSafeToSpend.ts, ABA-772) — subscriptions from the
 * per-account MMKV cache when the store has not loaded them.
 * Returns the server result when available; falls back to local approximation
 * with fxApproximate=true when the server result is absent or stale.
 *
 * Shape mirrors useFinancialHealthScore: { data, loading, hasEnoughData }.
 * Zero AI cost — fully deterministic.
 */
export function useSafeToSpend(): UseSafeToSpendResult {
  const { safeToSpend, safeToSpendLoading, loadSafeToSpend } = useInsightsStore();
  const { expenses: rawExpenses } = useExpenseStore();
  // Split-receivable debt rows are a receivable already carried by the original
  // receipt, not upcoming obligations — exclude them from the offline formula.
  const expenses = useMemo(() => filterConsumption(rawExpenses), [rawExpenses]);
  const { incomes: rawIncomes } = useIncomeStore();
  // Split-receivable incomes are kept out of income totals too (task H1).
  const incomes = useMemo(() => filterIncomeConsumption(rawIncomes), [rawIncomes]);
  const { walletSummary } = useWalletStore();
  const { goals } = useGoalStore();
  const { user } = useAuthStore();
  const { rates } = useExchangeRateStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const subscriptions = useUserSubscriptionStore((s) => s.subscriptions);

  // Load on mount AND on every account change.
  //
  // `currentAccountId` is load-bearing twice over, for two different failures:
  //
  //  - Cold start. This effect used to fire once, with `loadSafeToSpend` (a
  //    stable zustand action) as its only dependency — so it ran while
  //    `currentAccountId` was still null, before `accountStore.loadAccounts()`
  //    had resolved it. The store now refuses to issue that request; this
  //    dependency is what re-issues it, correctly addressed, the moment the
  //    account is known.
  //  - Account switch. Nothing re-fired this at all: the hero kept showing the
  //    previous account's figure for as long as the tab stayed mounted, which
  //    is not a race but a permanently wrong number. No guard inside the store
  //    can fix that — a guard can only suppress a wrong request, never trigger
  //    the right one. This dependency is the only part of the fix that does.
  useEffect(() => {
    loadSafeToSpend();
  }, [loadSafeToSpend, currentAccountId]);

  // Offline fallback: approximate the formula locally when server data is absent
  const localFallback = useMemo<SafeToSpendResponse | null>(() => {
    if (safeToSpend) return null; // server data available — skip local computation

    // Same rule as the server path: with no account resolved there is nothing
    // to attribute a figure to. The stores this reads from (`walletSummary`,
    // expenses, incomes, goals) are account-scoped, and at cold start they are
    // empty anyway — but returning early states the rule rather than relying on
    // that happening to be true.
    if (!currentAccountId) return null;

    const baseCurrency = user?.currencyCode ?? 'USD';
    const convert = (amount: number, currency: string) =>
      convertAmount(amount, currency || baseCurrency, baseCurrency, rates);

    // Wallet balance — sum all balances converted to base currency
    const walletBalance = walletSummary.reduce((sum, ws) => sum + convert(ws.currentBalance, ws.currencyCode), 0);

    // The server's own rules (localSafeToSpend.ts): expected — not received —
    // income, future recurring due dates, subscription renewals, goal pace.
    const accountSubs = (subscriptions.some((s) => s.accountId === currentAccountId)
      ? subscriptions
      : readCachedSubscriptions(currentAccountId)
    ).filter((s) => s.accountId === currentAccountId);
    const inputs = localSafeToSpendInputs({
      now: new Date(),
      incomes: incomes.filter((i) => !i.isDeleted),
      expenses: expenses.filter((e) => !e.isDeleted),
      subscriptions: accountSubs,
      goals,
      convert,
    });
    const { expectedIncome, incomeInferred, horizonDate, daysRemaining, upcomingSubscriptions, upcomingRecurring, goalContributions } =
      inputs;

    const result = computeSafeToSpend({
      walletBalance,
      expectedIncome,
      upcomingSubscriptions,
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
        upcomingSubscriptions,
        upcomingRecurring,
        goalContributions,
        buffer: 0,
      },
      computedAt: new Date().toISOString(),
    };
  }, [safeToSpend, user, walletSummary, expenses, incomes, goals, rates, currentAccountId, subscriptions]);

  const data = safeToSpend ?? localFallback;
  const hasEnoughData = data !== null;

  return {
    data,
    loading: safeToSpendLoading,
    hasEnoughData,
  };
}
