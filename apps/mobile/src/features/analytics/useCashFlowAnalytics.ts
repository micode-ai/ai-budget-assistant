import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { useAccountStore } from '@/stores/accountStore';
import { useFilteredTransactions } from './useFilteredTransactions';
import {
  classifyCommitments,
  monthWindowsEndingAt,
  monthlyCashFlow,
  summarizeCashFlow,
  type CashFlowSummary,
  type CommitmentsSummary,
  type MonthlyCashFlow,
} from './cashFlow';
import type { TimeRange } from './useAnalytics';

const EMPTY_IDS: string[] = [];

/** Months shown in the earned-vs-spent chart of the month view. */
const MONTH_VIEW_HISTORY = 6;

export interface CashFlowAnalytics {
  cashFlow: CashFlowSummary;
  /** Oldest first; empty in the week view, which has no monthly history to show. */
  cashFlowMonths: MonthlyCashFlow[];
  /**
   * Null until the tracked subscriptions for this account have loaded: before
   * then every subscription charge would read as flexible, and an unloaded
   * figure must never be drawn as fact.
   */
  commitments: CommitmentsSummary | null;
}

export function useCashFlowAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
): CashFlowAnalytics {
  const { expenses, incomes, categories, filteredExpenses, filteredIncomes, toDisplayCurrency, dateRange, anchorDay } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  // The account's fixed-cost categories (ABA-777); a stable reference while unchanged.
  const fixedCategoryIds = useAccountStore((s) => s.currentAccount()?.fixedCategoryIds) ?? EMPTY_IDS;
  const { t } = useTranslation();
  const subscriptions = useUserSubscriptionStore((s) => s.subscriptions);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!currentAccountId) return;
    let cancelled = false;
    useUserSubscriptionStore
      .getState()
      .loadSubscriptions()
      .finally(() => {
        if (!cancelled) setLoadedFor(currentAccountId);
      });
    return () => {
      cancelled = true;
    };
  }, [currentAccountId]);

  const cashFlow = useMemo(
    () => summarizeCashFlow(filteredExpenses, filteredIncomes, toDisplayCurrency),
    [filteredExpenses, filteredIncomes, toDisplayCurrency],
  );

  const cashFlowMonths = useMemo(() => {
    if (timeRange === 'week') return [];
    const windows =
      timeRange === 'year'
        ? monthWindowsEndingAt(new Date(dateRange.startDate.getFullYear(), 11, 1), 12)
        : monthWindowsEndingAt(dateRange.startDate, MONTH_VIEW_HISTORY, anchorDay);
    const byCurrency = <T extends { isDeleted?: boolean; currencyCode: string }>(rows: T[]) =>
      rows.filter((r) => !r.isDeleted && (!currencyCode || r.currencyCode === currencyCode));
    return monthlyCashFlow(byCurrency(expenses), byCurrency(incomes), windows, toDisplayCurrency);
  }, [timeRange, dateRange, expenses, incomes, currencyCode, toDisplayCurrency, anchorDay]);

  const commitments = useMemo(() => {
    if (!currentAccountId || loadedFor !== currentAccountId) return null;
    const accountSubs = subscriptions.filter((s) => s.accountId === currentAccountId);
    const ids = new Set(fixedCategoryIds);
    const nameOf = (id: string) => {
      const cat = categories.find((c) => c.id === id);
      return cat ? getCategoryDisplayName(cat, t) : '';
    };
    return classifyCommitments(filteredExpenses, accountSubs, toDisplayCurrency, { ids, nameOf });
  }, [currentAccountId, loadedFor, subscriptions, filteredExpenses, toDisplayCurrency, fixedCategoryIds, categories, t]);

  return { cashFlow, cashFlowMonths, commitments };
}
