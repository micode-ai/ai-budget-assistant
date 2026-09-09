import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useHydrationStore } from '@/stores/hydrateTransactions';
import { useIncomeStore } from '@/stores/incomeStore';
import { useWalletStore } from '@/stores/walletStore';
import {
  isDashboardRefreshing,
  resolveDashboardReadiness,
  type DashboardReadiness,
} from '@/features/dashboard/dataReadiness';

/**
 * How long the dashboard may show nothing but a spinner.
 *
 * Its own constant rather than a reuse of `FIRST_RUN_WAIT_TIMEOUT_MS`: the two
 * bounds guard different screens for different reasons, and sharing one knob
 * would mean a change made for onboarding silently retunes the loader (and
 * vice versa). The value matches it today, deliberately — a user should not be
 * able to tell which of the two is holding the screen.
 */
export const DASHBOARD_LOADER_TIMEOUT_MS = 5000;

export interface DashboardReadinessState extends DashboardReadiness {
  /** Whether the thin top progress bar should animate. */
  refreshing: boolean;
}

/**
 * Subscriptions and the bound timer for `resolveDashboardReadiness` — thin
 * glue, with every decision in the pure module it calls, since nothing renders
 * a component in this repo's CI.
 *
 * Safe on native despite reading six stores: `resolveDashboardReadiness`
 * short-circuits to "everything ready" there, so the extra subscriptions only
 * cost a re-render that the same screens already take from these stores
 * anyway.
 */
export function useDashboardReadiness(): DashboardReadinessState {
  const expensesPullAt = useExpenseStore((s) => s.lastPullAt);
  const incomesPullAt = useIncomeStore((s) => s.lastPullAt);
  const walletPullAt = useWalletStore((s) => s.lastPullAt);
  const budgetsPullAt = useBudgetStore((s) => s.lastPullAt);
  const categoriesReady = useCategoryStore((s) => s.isInitialized);

  const isHydrating = useHydrationStore((s) => s.isHydrating);
  const walletLoading = useWalletStore((s) => s.isLoading);
  const budgetsLoading = useBudgetStore((s) => s.isLoading);
  const categoriesLoading = useCategoryStore((s) => s.isLoading);

  // One timer, armed once on mount. Deliberately not keyed on the readiness
  // result: re-arming it whenever a pull lands would extend the bound every
  // time something arrived, which is the opposite of a bound.
  const [initialWaitElapsed, setInitialWaitElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setInitialWaitElapsed(true), DASHBOARD_LOADER_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  const readiness = resolveDashboardReadiness({
    isWeb: Platform.OS === 'web',
    expensesPullAt,
    incomesPullAt,
    walletPullAt,
    budgetsPullAt,
    categoriesReady,
    initialWaitElapsed,
  });

  return {
    ...readiness,
    refreshing: isDashboardRefreshing({
      isHydrating,
      walletLoading,
      budgetsLoading,
      categoriesLoading,
    }),
  };
}
