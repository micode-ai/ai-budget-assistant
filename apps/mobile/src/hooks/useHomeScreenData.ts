import { useState, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useDebtStore } from '@/stores/debtStore';
import { useWidgetVisibilityStore } from '@/stores/widgetVisibilityStore';
import { useQuickActionStore } from '@/stores/quickActionStore';
import { useAlertStore } from '@/stores/alertStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useSafeToSpend } from '@/features/insights/useSafeToSpend';

/**
 * Owns all Zustand store subscriptions + derived data + effects for the home
 * dashboard screen. Pure data layer — no theme/i18n/UI-local state (those stay
 * in `DashboardMobile`/`DashboardDesktop` or the components that render them).
 */
export function useHomeScreenData() {
  const [refreshing, setRefreshing] = useState(false);
  const [widgetRefreshKey, setWidgetRefreshKey] = useState(0);

  const { user } = useAuthStore();
  const { getMonthlyBudgetSummary } = useBudgetStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { walletSummary, loadWallet } = useWalletStore();
  const { convertedIncomeTotal, convertedExpenseTotal, loadRates, rates } = useExchangeRateStore();
  const { level, levelProgress, currentStreak, loadProfile } = useGamificationStore();
  const { summary: investmentSummary, loadSummary: loadInvestmentSummary } = useInvestmentStore();
  const { lentDebts, borrowedDebts, loadDebts } = useDebtStore();
  const currentAccountType = useAccountStore((s) => s.accounts.find((a) => a.id === s.currentAccountId)?.type);
  const { visibility: widgetVisibility, order: widgetOrder } = useWidgetVisibilityStore();
  const { visibility: quickActionVisibility, order: quickActionOrder } = useQuickActionStore();
  const unreadAlertCount = useAlertStore((s) => s.unreadCount) + useInvitationStore((s) => s.invitations.length);
  const loadAlerts = useAlertStore((s) => s.loadAlerts);
  const { data: safeToSpendData, hasEnoughData: hasSafeToSpend } = useSafeToSpend();

  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const currency = user?.currencyCode || 'USD';

  const convertedLentTotal = useMemo(
    () => lentDebts.reduce(
      (sum, d) => sum + convertAmount(d.remainingAmount, d.currencyCode, currency, rates), 0,
    ),
    [lentDebts, currency, rates],
  );
  const convertedBorrowedTotal = useMemo(
    () => borrowedDebts.reduce(
      (sum, d) => sum + convertAmount(d.remainingAmount, d.currencyCode, currency, rates), 0,
    ),
    [borrowedDebts, currency, rates],
  );

  useEffect(() => {
    if (currentAccountId) {
      hydrateTransactions().then(() => loadDebts());
      loadProfile();
      if (currentAccountType === 'investment') {
        loadInvestmentSummary();
      }
    }
  }, [currentAccountId, loadProfile, loadDebts, currentAccountType, loadInvestmentSummary]);

  // Refresh the alerts feed whenever the home tab regains focus (e.g. after
  // adding an expense and returning). The server creates anomaly alerts
  // asynchronously, so re-check once more shortly after to catch a fresh one
  // — this keeps the bell badge current without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (!currentAccountId) return;
      loadAlerts();
      useInvitationStore.getState().loadInvitations();

      // Retry the two loads that have no other second chance, and ONLY when
      // the server has never answered for them this session (`lastPullAt ===
      // null`, which their own stores set exclusively on a successful pull).
      //
      // Without this a single failed request at startup was permanent until a
      // full page reload: nothing re-fetches `/budgets` or `/wallet/summary`
      // when you come back to the dashboard — measured, the return trip fires
      // `/tags`, `/expenses`, `/projects`, `/incomes` and `/alerts` and neither
      // of these two. On web that showed as the budget widget simply missing
      // (an empty budget store renders nothing) and wallet figures stuck on
      // whatever partial state existed, because there is no SQLite copy to fall
      // back on the way the phone has.
      //
      // Gated on `lastPullAt` rather than on "the list is empty" on purpose: an
      // account can legitimately have no budgets, and re-requesting on every
      // focus for that user would be a request per visit forever. Read through
      // `.getState()` so this effect keeps its current dependencies and does
      // not re-fire on unrelated store writes.
      if (useBudgetStore.getState().lastPullAt === null) {
        void useBudgetStore.getState().loadBudgets();
      }
      if (useWalletStore.getState().lastPullAt === null) {
        void loadWallet();
      }

      const t = setTimeout(() => loadAlerts(), 2500);
      return () => clearTimeout(t);
    }, [loadAlerts, loadWallet, currentAccountId]),
  );

  const monthlyBudgetSummary = getMonthlyBudgetSummary();
  const totalBudget = monthlyBudgetSummary.totalAmount;
  const budgetSpent = monthlyBudgetSummary.totalSpent;
  const budgetUsedPercent = totalBudget > 0 ? (budgetSpent / totalBudget) * 100 : 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const promises: Promise<any>[] = [
        loadWallet(),
        loadRates(),
        loadProfile(),
        loadAlerts(),
        useInvitationStore.getState().loadInvitations(),
      ];
      if (currentAccountType === 'investment') {
        promises.push(loadInvestmentSummary());
      }
      await Promise.all([hydrateTransactions({ force: true }), ...promises]);
      await loadDebts();
    } finally {
      setRefreshing(false);
      setWidgetRefreshKey((k) => k + 1);
    }
  }, [loadWallet, loadRates, loadProfile, loadDebts, currentAccountType, loadInvestmentSummary, loadAlerts]);

  const remaining = totalBudget - budgetSpent;

  return {
    user,
    canEdit,
    currency,
    walletSummary,
    convertedIncomeTotal,
    convertedExpenseTotal,
    level,
    levelProgress,
    currentStreak,
    investmentSummary,
    lentDebts,
    borrowedDebts,
    convertedLentTotal,
    convertedBorrowedTotal,
    currentAccountType,
    widgetVisibility,
    widgetOrder,
    quickActionVisibility,
    quickActionOrder,
    unreadAlertCount,
    currentAccountId,
    monthlyBudgetSummary,
    totalBudget,
    budgetSpent,
    budgetUsedPercent,
    remaining,
    refreshing,
    widgetRefreshKey,
    onRefresh,
    safeToSpendData,
    hasSafeToSpend,
    rates,
  };
}

export type UseHomeScreenDataReturn = ReturnType<typeof useHomeScreenData>;
