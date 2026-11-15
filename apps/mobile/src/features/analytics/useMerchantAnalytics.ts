import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { groupMerchants } from './merchantGrouping';
import type { TimeRange, MerchantSpending } from './useAnalytics';

const MERCHANT_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F97316', '#6366F1'];
const MERCHANT_OTHER_COLOR = '#9CA3AF';
const TOP = 8;

export function useMerchantAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { filteredExpenses, getAmount } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const merchantSpending = useMemo((): MerchantSpending[] => {
    // Case-insensitive grouping, visits and average ticket: merchantGrouping.ts.
    const groups = groupMerchants(filteredExpenses, getAmount);
    const total = groups.reduce((s, g) => s + g.amount, 0);
    if (total === 0) return [];

    const result: MerchantSpending[] = groups.slice(0, TOP).map((g, i) => ({
      ...g,
      percentage: (g.amount / total) * 100,
      color: MERCHANT_COLORS[i % MERCHANT_COLORS.length],
    }));

    const rest = groups.slice(TOP);
    if (rest.length > 0) {
      const amount = rest.reduce((s, g) => s + g.amount, 0);
      const visits = rest.reduce((s, g) => s + g.visits, 0);
      result.push({
        merchant: t('analytics.merchantOther'),
        amount,
        visits,
        averageTicket: amount / visits,
        percentage: (amount / total) * 100,
        color: MERCHANT_OTHER_COLOR,
        isOther: true,
      });
    }

    return result;
  }, [filteredExpenses, getAmount, t]);

  return { merchantSpending };
}
