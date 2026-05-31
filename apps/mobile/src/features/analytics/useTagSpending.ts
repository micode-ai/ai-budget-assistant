import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useTagStore } from '@/stores/tagStore';
import { useAccountStore } from '@/stores/accountStore';
import { getAllExpenseTagMappings } from '@/db/tagRepository';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, TagSpending } from './useAnalytics';

const TAG_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#6B7280',
];

export function useTagSpending(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { tags } = useTagStore();
  const { filteredExpenses, getAmount } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);
  const [tagSpending, setTagSpending] = useState<TagSpending[]>([]);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      if (filteredExpenses.length === 0) {
        if (!cancelled) setTagSpending([]);
        return;
      }

      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) {
        if (!cancelled) setTagSpending([]);
        return;
      }

      try {
        const mappings = await getAllExpenseTagMappings(accountId);
        if (cancelled) return;

        const expenseIds = new Set(filteredExpenses.map((e) => e.id));
        const expenseAmountMap = new Map(filteredExpenses.map((e) => [e.id, getAmount(e)]));

        const tagAmountMap = new Map<string, number>();
        for (const m of mappings) {
          if (!expenseIds.has(m.expenseId)) continue;
          const amount = expenseAmountMap.get(m.expenseId) || 0;
          tagAmountMap.set(m.tagId, (tagAmountMap.get(m.tagId) || 0) + amount);
        }

        const totalTagged = Array.from(tagAmountMap.values()).reduce((s, a) => s + a, 0);
        if (totalTagged === 0) {
          if (!cancelled) setTagSpending([]);
          return;
        }

        const result: TagSpending[] = [];
        let colorIndex = 0;
        for (const [tagId, amount] of tagAmountMap) {
          const tag = tags.find((t) => t.id === tagId) || tags.find((t) => t.name === tagId);
          result.push({
            tagId,
            name: tag?.name || tagId,
            amount,
            percentage: (amount / totalTagged) * 100,
            color: tag?.color || TAG_COLORS[colorIndex % TAG_COLORS.length],
          });
          colorIndex++;
        }

        if (!cancelled) setTagSpending(result.sort((a, b) => b.amount - a.amount));
      } catch {
        if (!cancelled) setTagSpending([]);
      }
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) compute();
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [filteredExpenses, tags, getAmount]);

  return { tagSpending };
}
