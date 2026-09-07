import { useState, useEffect, useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { useInsightsStore } from '@/stores/insightsStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { useAnalytics, type TimeRange } from '@/features/analytics/useAnalytics';
import { getIntlLocale } from '@/i18n';
import { usePeriodNavigation } from '@/hooks/usePeriodNavigation';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { useAlertStore } from '@/stores/alertStore';
import type { Currency } from '@budget/shared-types';

/**
 * Owns all Zustand store subscriptions, derived data, effects and handlers
 * for the analytics screen (formerly `app/(tabs)/analytics.tsx`'s inline
 * body). Pure data/logic layer — no theme/JSX-producing render helpers
 * (those stay in `AnalyticsMobile`, mirroring `useExpensesScreenData.ts`'s
 * split of theme/UI-local concerns from the transactions screen's data
 * hook). Extracted so a desktop view can share the same derived data instead
 * of duplicating it.
 */
export function useAnalyticsScreenData() {
  const { i18n } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('month');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | undefined>(undefined);
  const intlLocale = getIntlLocale();

  const { selectedMonth, selectedYear, isCurrentPeriod, getPeriodLabel, goToPrevPeriod, goToNextPeriod, resetToCurrentPeriod } =
    usePeriodNavigation(selectedRange, intlLocale);

  const analytics = useAnalytics(
    selectedRange, selectedCurrency,
    selectedRange !== 'week' ? selectedMonth : undefined,
    selectedYear,
  );
  const { dailySpending, categorySpending, merchantSpending, incomeByCategory, summary, itemBreakdown, dayOfWeekSpending, periodComparison, anomalies, predictions, dateRange, tagSpending, projectSpending } = analytics;

  const { aiInsights, aiInsightsProGated, loadAIInsights } = useInsightsStore();
  const { loadRates } = useExchangeRateStore();
  const { loadTags } = useTagStore();
  const { loadProjects } = useProjectStore();
  const { walletSummary } = useWalletStore();
  const { user } = useAuthStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const availableCurrencies = walletSummary.map((s) => s.currencyCode);
  const currency = selectedCurrency || user?.currencyCode || 'USD';

  useEffect(() => {
    loadAIInsights(i18n.language);
    loadRates();
    loadTags();
    loadProjects();
  }, [loadAIInsights, loadRates, loadTags, loadProjects, i18n.language]);

  useEffect(() => {
    if (!currentAccountId) return;
    hydrateTransactions();
    // No `usePriceHistoryStore.reset()` here: `accountStore` clears that store
    // at the account boundary now (ABA-511), because Settings -> Products reads
    // it too and a second component clearing it on `[currentAccountId]` would
    // fight this one. This effect owns only the refill.
    useAlertStore.getState().clearPriceCheckSummary();
    usePriceHistoryStore.getState().loadPriceHistory();
    // Decorative "found" total shown alongside the inflation index — same
    // account-scoped refresh cadence as the price history it sits next to.
    useAlertStore.getState().loadPriceCheckSummary();
  }, [currentAccountId]);

  const openDrillDown = useCallback(() => {
    router.push({
      pathname: '/analytics/drill-down',
      params: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        currencyCode: currency,
        level: selectedRange === 'year' ? 'year' : 'month',
      },
    });
  }, [dateRange.startDate, dateRange.endDate, currency, selectedRange]);

  // Same fields `openDrillDown` pushes as route params, exposed as plain data
  // (additive — `openDrillDown` above is unchanged and still what
  // `AnalyticsMobile` calls) so a desktop caller can open `DrillDownDialog`
  // with them instead of navigating. Kept as strings, matching what
  // `useLocalSearchParams`/`DrillDownView`'s `initial` prop expect either way.
  const drillDownParams = useMemo(
    () => ({
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString(),
      currencyCode: currency,
      level: selectedRange === 'year' ? 'year' : 'month',
    }),
    [dateRange.startDate, dateRange.endDate, currency, selectedRange],
  );

  return {
    selectedRange,
    setSelectedRange,
    selectedCurrency,
    setSelectedCurrency,
    selectedMonth,
    selectedYear,
    isCurrentPeriod,
    getPeriodLabel,
    goToPrevPeriod,
    goToNextPeriod,
    resetToCurrentPeriod,
    availableCurrencies,
    currency,
    dailySpending,
    categorySpending,
    merchantSpending,
    incomeByCategory,
    summary,
    itemBreakdown,
    dayOfWeekSpending,
    periodComparison,
    anomalies,
    predictions,
    tagSpending,
    projectSpending,
    aiInsights,
    aiInsightsProGated,
    openDrillDown,
    drillDownParams,
  };
}

export type UseAnalyticsScreenDataReturn = ReturnType<typeof useAnalyticsScreenData>;
