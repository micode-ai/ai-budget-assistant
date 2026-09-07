import { useState, useCallback, useEffect } from 'react';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Owns the budgets tab's store subscriptions, effects and handlers (formerly
 * `app/(tabs)/budgets.tsx`'s inline body). Pure data/logic layer — no
 * theme/JSX-producing render helpers (those stay in `BudgetsMobile`),
 * mirroring `useAnalyticsScreenData.ts`'s same split. Extracted so a desktop
 * view can share the same derived data instead of duplicating it.
 */
export function useBudgetsScreenData() {
  const [refreshing, setRefreshing] = useState(false);
  const { budgets, getBudgetProgress, loadBudgets } = useBudgetStore();
  const budgetsLoading = useBudgetStore((s) => s.isLoading);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  useEffect(() => {
    if (currentAccountId) loadBudgets();
  }, [currentAccountId, loadBudgets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBudgets();
    } finally {
      setRefreshing(false);
    }
  }, [loadBudgets]);

  const visibleBudgets = budgets.filter((b) => !b.isDeleted && b.accountId === currentAccountId);

  return {
    refreshing,
    onRefresh,
    visibleBudgets,
    getBudgetProgress,
    budgetsLoading,
    canEdit,
  };
}

export type UseBudgetsScreenDataReturn = ReturnType<typeof useBudgetsScreenData>;
