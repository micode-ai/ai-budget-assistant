import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { Child, ExpenseItem } from '@budget/shared-types';
import { getChildLineItems } from '@/db/expenseItemRepository';
import { useAccountChildren } from '@/hooks/useAccountChildren';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useIncomeStore } from '@/stores/incomeStore';
import { collectWebLines, type ChildCostSources } from './childCosts';

const EMPTY_LINES: ExpenseItem[] = [];

export interface ChildCostSourcesState {
  /** Null while anything is still loading or a load failed. */
  sources: ChildCostSources | null;
  children: Child[];
  /** The children list itself has loaded for this account (amounts may still be loading). */
  childrenLoaded: boolean;
  loading: boolean;
  /** A load failed — a different state from an empty one; the screen offers a retry. */
  error: boolean;
  retry: () => void;
  displayCurrency: string;
}

/**
 * Everything child costs are computed from, and whether it has all arrived.
 *
 * **Never draw unloaded data as fact** (desktop-dashboard): on web the stores
 * fill from the network after the screen mounts, and a child total computed
 * from an empty expense list is a confident 0. So `sources` stays null — and
 * `loading` true — until the children, the expenses, the incomes and (native)
 * the receipt lines have all landed. Native reads SQLite, which holds the
 * account, so only the children and the line read gate it there. A failed load
 * is `error`, never an empty child.
 */
export interface ChildCostSourcesOptions {
  /** Tests pass a fixed clock; screens omit it. */
  now?: Date;
  /**
   * Only non-archived children matter to the caller (the Analytics section).
   * With none, nothing is read or computed: the native line read is skipped.
   */
  activeOnly?: boolean;
}

export function useChildCostSources({ now, activeOnly = false }: ChildCostSourcesOptions = {}): ChildCostSourcesState {
  const accountId = useAccountStore((s) => s.currentAccountId);
  const { children, isLoaded: childrenLoaded, loadFailed, reload } = useAccountChildren();
  const relevantCount = activeOnly ? children.filter((c) => !c.archivedAt).length : children.length;
  // No (relevant) children: nothing to attribute, so no line read and no totals.
  const needsData = childrenLoaded && relevantCount > 0;

  const expenses = useExpenseStore((s) => s.expenses);
  const expenseItems = useExpenseStore((s) => s.expenseItems);
  const expensesPullAt = useExpenseStore((s) => s.lastPullAt);
  const incomes = useIncomeStore((s) => s.incomes);
  const incomesPullAt = useIncomeStore((s) => s.lastPullAt);
  const expensesError = useExpenseStore((s) => s.error);
  const incomesError = useIncomeStore((s) => s.error);

  const rates = useExchangeRateStore((s) => s.rates);
  const ratesLoading = useExchangeRateStore((s) => s.isLoading);
  const baseCurrency = useExchangeRateStore((s) => s.baseCurrency);
  const userCurrency = useAuthStore((s) => s.user?.currencyCode);
  const displayCurrency = userCurrency || baseCurrency || 'USD';

  const isWeb = Platform.OS === 'web';
  const [attempt, setAttempt] = useState(0);

  // Web: a deep link or a reload lands here with nothing pulled yet. The pull
  // logs and swallows a network failure (no store error, `lastPullAt` stays
  // null), so the hydrate that WE awaited finishing with nothing pulled is
  // itself the failure signal — otherwise the screen would spin for ever.
  const [pullSettledFor, setPullSettledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId || !isWeb) return;
    const pulled = () =>
      useExpenseStore.getState().lastPullAt != null && useIncomeStore.getState().lastPullAt != null;
    if (pulled()) return;
    let cancelled = false;
    setPullSettledFor(null);
    hydrateTransactions(attempt > 0 ? { force: true } : undefined)
      .catch((e: unknown) => {
        console.warn('[children] transactions pull failed:', e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setPullSettledFor(accountId);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, isWeb, attempt]);

  // Rates: "no rates" only counts as an answer once a load has run. Until then a
  // foreign-currency amount would be dropped and flagged for nothing.
  const ratesEmpty = Object.keys(rates).length === 0;
  const [ratesAttempted, setRatesAttempted] = useState(false);
  useEffect(() => {
    if (!ratesEmpty) return;
    if (!ratesLoading && !ratesAttempted) void useExchangeRateStore.getState().loadRates();
    setRatesAttempted(true);
  }, [ratesEmpty, ratesLoading, ratesAttempted, displayCurrency]);

  // Native: the receipt lines of line-attributed expenses, re-read whenever the
  // expense list or a screen's loaded lines change (an attribution writes both).
  const [nativeLines, setNativeLines] = useState<{ accountId: string; lines: ExpenseItem[] } | null>(null);
  const [linesFailed, setLinesFailed] = useState(false);
  useEffect(() => {
    if (isWeb || !accountId || !needsData) return;
    let cancelled = false;
    getChildLineItems(accountId)
      .then((lines) => {
        if (cancelled) return;
        setNativeLines({ accountId, lines });
        setLinesFailed(false);
      })
      .catch((e: unknown) => {
        console.warn('[children] receipt lines unavailable:', e instanceof Error ? e.message : String(e));
        if (!cancelled) setLinesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isWeb, accountId, needsData, expenses, expenseItems, attempt]);

  const webLines = useMemo(
    () => (isWeb && needsData ? collectWebLines(expenses, expenseItems) : EMPTY_LINES),
    [isWeb, needsData, expenses, expenseItems],
  );

  const transactionsReady = isWeb ? expensesPullAt != null && incomesPullAt != null : true;
  const linesReady = isWeb || !needsData || (nativeLines !== null && nativeLines.accountId === accountId);
  const ratesReady = !ratesEmpty || (ratesAttempted && !ratesLoading);

  // Web: a pull that failed before any landed is an error with a retry, never an endless spinner.
  const transactionsFailed =
    isWeb &&
    !transactionsReady &&
    ((expensesPullAt == null && !!expensesError) ||
      (incomesPullAt == null && !!incomesError) ||
      pullSettledFor === accountId);
  const error = loadFailed || transactionsFailed || (!isWeb && linesFailed && !linesReady);
  const loading = !error && (!childrenLoaded || !transactionsReady || !linesReady || !ratesReady);

  const nowKey = now?.getTime();
  const sources = useMemo<ChildCostSources | null>(() => {
    if (loading || error) return null;
    return {
      expenses,
      incomes,
      lines: isWeb ? webLines : needsData ? (nativeLines?.lines ?? EMPTY_LINES) : EMPTY_LINES,
      rates,
      displayCurrency,
      now: nowKey != null ? new Date(nowKey) : new Date(),
    };
  }, [loading, error, expenses, incomes, isWeb, webLines, needsData, nativeLines, rates, displayCurrency, nowKey]);

  const retry = useCallback(() => {
    reload();
    setAttempt((n) => n + 1);
  }, [reload]);

  return { sources, children, childrenLoaded, loading, error, retry, displayCurrency };
}
