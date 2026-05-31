import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useProjectStore } from '@/stores/projectStore';
import { useAccountStore } from '@/stores/accountStore';
import { getAllProjectExpenseMappings } from '@/db/projectRepository';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, ProjectSpending } from './useAnalytics';

const PROJECT_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#6B7280',
];

export function useProjectSpending(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { projects } = useProjectStore();
  const { filteredExpenses, getAmount } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);
  const [projectSpending, setProjectSpending] = useState<ProjectSpending[]>([]);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      if (filteredExpenses.length === 0) {
        if (!cancelled) setProjectSpending([]);
        return;
      }

      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) {
        if (!cancelled) setProjectSpending([]);
        return;
      }

      try {
        const mappings = await getAllProjectExpenseMappings(accountId);
        if (cancelled) return;

        const expenseIds = new Set(filteredExpenses.map((e) => e.id));
        const expenseAmountMap = new Map(filteredExpenses.map((e) => [e.id, getAmount(e)]));

        const projectAmountMap = new Map<string, number>();
        for (const m of mappings) {
          if (!expenseIds.has(m.expenseId)) continue;
          const amount = expenseAmountMap.get(m.expenseId) || 0;
          projectAmountMap.set(m.projectId, (projectAmountMap.get(m.projectId) || 0) + amount);
        }

        const totalProjected = Array.from(projectAmountMap.values()).reduce((s, a) => s + a, 0);
        if (totalProjected === 0) {
          if (!cancelled) setProjectSpending([]);
          return;
        }

        const result: ProjectSpending[] = [];
        let colorIndex = 0;
        for (const [projectId, amount] of projectAmountMap) {
          const project = projects.find((p) => p.id === projectId) || projects.find((p) => p.name === projectId);
          result.push({
            projectId,
            name: project?.name || projectId,
            amount,
            percentage: (amount / totalProjected) * 100,
            color: project?.color || PROJECT_COLORS[colorIndex % PROJECT_COLORS.length],
            budget: project?.budget,
          });
          colorIndex++;
        }

        if (!cancelled) setProjectSpending(result.sort((a, b) => b.amount - a.amount));
      } catch {
        if (!cancelled) setProjectSpending([]);
      }
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) compute();
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [filteredExpenses, projects, getAmount]);

  return { projectSpending };
}
