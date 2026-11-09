import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useFilteredTransactions } from './useFilteredTransactions';
import { groupExpensesByMember } from './memberGrouping';
import type { TimeRange, MemberSpending } from './useAnalytics';

const MEMBER_COLORS = ['#4ECDC4', '#FF6B6B', '#45B7D1', '#FFEAA7', '#DDA0DD', '#96CEB4', '#F97316', '#6366F1'];

/**
 * Spending by the member who created it. Computed on the device; empty on a
 * personal account and when fewer than two distinct creators have spend.
 */
export function useMemberAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { filteredExpenses, toDisplayCurrency } = useFilteredTransactions(
    timeRange, currencyCode, selectedMonth, selectedYear,
  );
  const accountType = useAccountStore((s) => s.currentAccount()?.type);
  const me = useAuthStore((s) => s.user);

  const memberSpending = useMemo((): MemberSpending[] => {
    if (!accountType || accountType === 'personal') return [];
    const totals = groupExpensesByMember(filteredExpenses, toDisplayCurrency).slice(0, MEMBER_COLORS.length);
    if (totals.length < 2) return [];
    const total = totals.reduce((s, m) => s + m.amount, 0);
    if (total === 0) return [];
    return totals.map((m, i) => ({
      userId: m.userId,
      name: m.name ?? (m.userId && m.userId === me?.id && me?.name ? me.name : t('analytics.memberUnknown')),
      amount: m.amount,
      percentage: (m.amount / total) * 100,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
    }));
  }, [filteredExpenses, toDisplayCurrency, accountType, me, t]);

  return { memberSpending };
}
