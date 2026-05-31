import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, MerchantSpending } from './useAnalytics';

const MERCHANT_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F97316', '#6366F1'];
const MERCHANT_OTHER_COLOR = '#9CA3AF';

export function useMerchantAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { filteredExpenses, getAmount } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const merchantSpending = useMemo((): MerchantSpending[] => {
    const withMerchant = filteredExpenses.filter((e) => e.merchant != null && e.merchant.trim() !== '');
    if (withMerchant.length === 0) return [];

    const merchantMap = new Map<string, number>();
    for (const e of withMerchant) {
      const key = e.merchant!.trim();
      merchantMap.set(key, (merchantMap.get(key) || 0) + getAmount(e));
    }

    const total = Array.from(merchantMap.values()).reduce((s, a) => s + a, 0);
    if (total === 0) return [];

    const sorted = Array.from(merchantMap.entries()).sort((a, b) => b[1] - a[1]);
    const TOP = 8;
    const top = sorted.slice(0, TOP);
    const rest = sorted.slice(TOP);

    const result: MerchantSpending[] = top.map(([merchant, amount], i) => ({
      merchant,
      amount,
      percentage: (amount / total) * 100,
      color: MERCHANT_COLORS[i % MERCHANT_COLORS.length],
    }));

    if (rest.length > 0) {
      const otherAmount = rest.reduce((s, [, a]) => s + a, 0);
      result.push({
        merchant: t('analytics.merchantOther'),
        amount: otherAmount,
        percentage: (otherAmount / total) * 100,
        color: MERCHANT_OTHER_COLOR,
      });
    }

    return result;
  }, [filteredExpenses, getAmount, t]);

  return { merchantSpending };
}
