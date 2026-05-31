import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { loadItemsByExpenseId } from '@/db/expenseItemRepository';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, ItemBreakdown } from './useAnalytics';

export function useItemBreakdown(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { filteredExpenses, toDisplayCurrency } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);
  const [itemBreakdown, setItemBreakdown] = useState<ItemBreakdown[]>([]);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      const ocrExpenses = filteredExpenses.filter((e) => e.source === 'ocr');
      if (ocrExpenses.length === 0) {
        if (!cancelled) setItemBreakdown([]);
        return;
      }

      const itemMap = new Map<string, { totalSpent: number; count: number }>();
      for (const expense of ocrExpenses) {
        if (cancelled) return;
        try {
          const items = await loadItemsByExpenseId(expense.id);
          for (const item of items) {
            const key = item.description.toLowerCase().trim();
            const existing = itemMap.get(key) || { totalSpent: 0, count: 0 };
            itemMap.set(key, {
              totalSpent: existing.totalSpent + toDisplayCurrency(item.totalPrice, expense.currencyCode),
              count: existing.count + (item.quantity || 1),
            });
          }
        } catch {
          // skip failed loads
        }
      }

      if (cancelled) return;
      const result: ItemBreakdown[] = Array.from(itemMap.entries())
        .map(([description, data]) => ({
          description,
          totalSpent: data.totalSpent,
          count: data.count,
          avgPrice: data.count > 0 ? data.totalSpent / data.count : 0,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20);

      setItemBreakdown(result);
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) compute();
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [filteredExpenses, toDisplayCurrency]);

  return { itemBreakdown };
}
