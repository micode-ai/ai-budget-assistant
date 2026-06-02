import { useMemo } from 'react';
import { useBudgetStore } from '@/stores/budgetStore';
import { useDebtStore } from '@/stores/debtStore';
import { useGoalStore } from '@/stores/goalStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';

export type HealthComponentKey = 'budgetAdherence' | 'savingsRate' | 'goalProgress' | 'debtHealth';
export type HealthColorKey = 'red' | 'yellow' | 'green';

export interface HealthScoreComponent {
  key: HealthComponentKey;
  points: number;
  maxPoints: 25;
  included: boolean;
  detailKey: string;
  detailParams?: Record<string, string | number>;
}

export interface FinancialHealthScore {
  score: number;
  hasEnoughData: boolean;
  colorKey: HealthColorKey;
  components: HealthScoreComponent[];
}

function colorForScore(score: number): HealthColorKey {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

export function useFinancialHealthScore(): FinancialHealthScore {
  const { budgets, getBudgetProgress } = useBudgetStore();
  const { lentDebts, borrowedDebts } = useDebtStore();
  const { goals } = useGoalStore();
  const { convertedIncomeTotal, convertedExpenseTotal } = useExchangeRateStore();

  return useMemo(() => {
    const components: HealthScoreComponent[] = [];

    // 1. Budget adherence
    const activeBudgets = budgets.filter((b) => b.isActive && !b.isDeleted);
    if (activeBudgets.length > 0) {
      const notOverCount = activeBudgets.filter((b) => {
        const progress = getBudgetProgress(b.id);
        return progress ? !progress.isOverBudget : true;
      }).length;
      const ratio = notOverCount / activeBudgets.length;
      const points = Math.round(ratio * 25) as 0 | 25 | number;
      components.push({
        key: 'budgetAdherence',
        points,
        maxPoints: 25,
        included: true,
        detailKey: ratio === 1
          ? 'healthScore.detail.budgetsOnTrack'
          : 'healthScore.detail.budgetsOverLimit',
        detailParams: {
          overCount: activeBudgets.length - notOverCount,
          totalCount: activeBudgets.length,
        },
      });
    } else {
      components.push({
        key: 'budgetAdherence',
        points: 0,
        maxPoints: 25,
        included: false,
        detailKey: 'healthScore.detail.noBudgets',
      });
    }

    // 2. Savings rate (current month income vs expenses from exchangeRateStore)
    if (convertedIncomeTotal > 0) {
      const savingsRate = (convertedIncomeTotal - convertedExpenseTotal) / convertedIncomeTotal;
      // 0% → 0 pts, 20%+ → 25 pts, linear
      const clamped = Math.max(0, Math.min(savingsRate, 0.2));
      const points = Math.round((clamped / 0.2) * 25);
      const pct = Math.round(savingsRate * 100);
      components.push({
        key: 'savingsRate',
        points,
        maxPoints: 25,
        included: true,
        detailKey: pct >= 20
          ? 'healthScore.detail.savingsRateGood'
          : 'healthScore.detail.savingsRateLow',
        detailParams: { pct },
      });
    } else {
      components.push({
        key: 'savingsRate',
        points: 0,
        maxPoints: 25,
        included: false,
        detailKey: 'healthScore.detail.noIncome',
      });
    }

    // 3. Goal progress — active (non-completed/cancelled) goals
    const activeGoals = goals.filter((g) => g.status === 'active');
    if (activeGoals.length > 0) {
      const now = Date.now();
      const onTrackCount = activeGoals.filter((g) => {
        const created = new Date(g.createdAt).getTime();
        const deadline = new Date(g.deadline).getTime();
        const totalSpan = deadline - created;
        if (totalSpan <= 0) return g.currentAmount >= g.targetAmount;
        const elapsed = now - created;
        const fractionElapsed = Math.min(1, elapsed / totalSpan);
        const expectedAmount = fractionElapsed * g.targetAmount;
        return g.currentAmount >= expectedAmount;
      }).length;
      const ratio = onTrackCount / activeGoals.length;
      const points = Math.round(ratio * 25);
      components.push({
        key: 'goalProgress',
        points,
        maxPoints: 25,
        included: true,
        detailKey: ratio === 1
          ? 'healthScore.detail.goalsOnTrack'
          : 'healthScore.detail.goalsBehind',
        detailParams: {
          onTrackCount,
          totalCount: activeGoals.length,
        },
      });
    } else {
      components.push({
        key: 'goalProgress',
        points: 0,
        maxPoints: 25,
        included: false,
        detailKey: 'healthScore.detail.noGoals',
      });
    }

    // 4. Debt health — always included; no debt = full 25 pts
    const allDebts = [...lentDebts, ...borrowedDebts];
    const totalDebt = allDebts.length;
    const overdueCount = allDebts.filter((d) => d.status === 'overdue').length;
    if (totalDebt === 0 || overdueCount === 0) {
      components.push({
        key: 'debtHealth',
        points: 25,
        maxPoints: 25,
        included: true,
        detailKey: 'healthScore.detail.noOverdueDebts',
      });
    } else {
      const ratio = 1 - overdueCount / totalDebt;
      const points = Math.round(ratio * 25);
      components.push({
        key: 'debtHealth',
        points,
        maxPoints: 25,
        included: true,
        detailKey: 'healthScore.detail.overdueDebts',
        detailParams: { overdueCount },
      });
    }

    const includedComponents = components.filter((c) => c.included);
    const hasEnoughData = includedComponents.length >= 2;

    if (!hasEnoughData) {
      return { score: 0, hasEnoughData: false, colorKey: 'red', components };
    }

    const rawPoints = includedComponents.reduce((s, c) => s + c.points, 0);
    const maxPossible = includedComponents.length * 25;
    const score = Math.round((rawPoints / maxPossible) * 100);

    return { score, hasEnoughData, colorKey: colorForScore(score), components };
  }, [budgets, getBudgetProgress, lentDebts, borrowedDebts, goals, convertedIncomeTotal, convertedExpenseTotal]);
}
