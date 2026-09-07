import {
  classifyBudget,
  groupBudgets,
  shouldShowGroupHeaders,
  countCategoriesOverAllocation,
  type ClassifiedBudget,
} from '../budgetGrouping';
import type { Budget, BudgetProgress } from '@budget/shared-types';

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    localId: 'b1',
    userId: 'u1',
    accountId: 'a1',
    name: 'Groceries',
    amount: 500,
    currencyCode: 'USD',
    period: 'monthly',
    startDate: new Date(2026, 7, 1),
    alertThreshold: 80,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
    ...overrides,
  };
}

function makeProgress(budget: Budget, overrides: Partial<BudgetProgress> = {}): BudgetProgress {
  return {
    budget,
    spent: 0,
    remaining: budget.amount,
    percentageUsed: 0,
    isOverBudget: false,
    daysRemaining: 10,
    projectedTotal: 0,
    dailyBurnRate: 0,
    ...overrides,
  };
}

describe('classifyBudget', () => {
  it('classifies an inactive budget as inactive regardless of its numbers', () => {
    const budget = makeBudget({ isActive: false });
    const progress = makeProgress(budget, { percentageUsed: 150, isOverBudget: true });
    expect(classifyBudget(budget, progress)).toMatchObject({ state: 'inactive', needsAttention: false });
  });

  it('classifies an actually-over budget as over', () => {
    const budget = makeBudget();
    const progress = makeProgress(budget, { spent: 620, percentageUsed: 124, isOverBudget: true });
    expect(classifyBudget(budget, progress)).toMatchObject({ state: 'over', needsAttention: true });
  });

  it("classifies at-or-above the budget's own alertThreshold as nearing, not a hardcoded 80%", () => {
    const budget = makeBudget({ alertThreshold: 50 });
    const progress = makeProgress(budget, { spent: 300, percentageUsed: 60, isOverBudget: false });
    expect(classifyBudget(budget, progress)).toMatchObject({ state: 'nearing', needsAttention: true });
  });

  it('falls back to 80% when alertThreshold is null', () => {
    const budget = makeBudget({ alertThreshold: null });
    const under = makeProgress(budget, { spent: 300, percentageUsed: 60 });
    expect(classifyBudget(budget, under).state).toBe('onTrack');

    const over = makeProgress(budget, { spent: 410, percentageUsed: 82 });
    expect(classifyBudget(budget, over).state).toBe('nearing');
  });

  it('classifies a projected overspend as nearing even when current usage is under threshold', () => {
    const budget = makeBudget({ alertThreshold: 80 });
    const progress = makeProgress(budget, {
      spent: 100,
      percentageUsed: 20,
      isOverBudget: false,
      projectedTotal: 600,
    });
    expect(classifyBudget(budget, progress)).toMatchObject({ state: 'nearing', needsAttention: true });
  });

  it('classifies comfortably-under as onTrack', () => {
    const budget = makeBudget();
    const progress = makeProgress(budget, { spent: 100, percentageUsed: 20, projectedTotal: 120 });
    expect(classifyBudget(budget, progress)).toMatchObject({ state: 'onTrack', needsAttention: false });
  });

  it('degrades to onTrack (not a crash) when progress is null', () => {
    const budget = makeBudget();
    expect(classifyBudget(budget, null)).toMatchObject({ state: 'onTrack', needsAttention: false, percentageUsed: 0 });
  });
});

describe('groupBudgets / shouldShowGroupHeaders', () => {
  const over = classifyBudget(
    makeBudget({ id: 'over', name: 'Over' }),
    makeProgress(makeBudget({ id: 'over' }), { percentageUsed: 124, isOverBudget: true }),
  );
  const nearing = classifyBudget(
    makeBudget({ id: 'nearing', name: 'Nearing' }),
    makeProgress(makeBudget({ id: 'nearing' }), { percentageUsed: 82 }),
  );
  const onTrackHigh = classifyBudget(
    makeBudget({ id: 'high', name: 'High' }),
    makeProgress(makeBudget({ id: 'high' }), { percentageUsed: 60 }),
  );
  const onTrackLow = classifyBudget(
    makeBudget({ id: 'low', name: 'Low' }),
    makeProgress(makeBudget({ id: 'low' }), { percentageUsed: 10 }),
  );
  const inactiveHigh = classifyBudget(
    makeBudget({ id: 'inactive', name: 'Inactive', isActive: false }),
    makeProgress(makeBudget({ id: 'inactive' }), { percentageUsed: 99 }),
  );

  it('splits into needsAttention/onTrack and sorts each worst-first', () => {
    const groups = groupBudgets([onTrackLow, inactiveHigh, nearing, onTrackHigh, over]);
    expect(groups.needsAttention.map((c) => c.budget.id)).toEqual(['over', 'nearing']);
    // Inactive (99%) sorts LAST despite its high number -- active budgets by
    // percentage first, then every inactive one regardless of its own %.
    expect(groups.onTrack.map((c) => c.budget.id)).toEqual(['high', 'low', 'inactive']);
  });

  it('shows group headers only when both groups are non-empty', () => {
    expect(shouldShowGroupHeaders(groupBudgets([onTrackLow, over]))).toBe(true);
    expect(shouldShowGroupHeaders(groupBudgets([onTrackLow, onTrackHigh]))).toBe(false);
    expect(shouldShowGroupHeaders(groupBudgets([over, nearing]))).toBe(false);
    expect(shouldShowGroupHeaders(groupBudgets([]))).toBe(false);
  });
});

describe('countCategoriesOverAllocation', () => {
  it('counts over-allocated categories across active multi-category budgets only', () => {
    const activeBudget = makeBudget({
      id: 'multi',
      categoryAllocations: [
        { id: 'a1', budgetId: 'multi', categoryId: 'c1', amount: 100, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, syncVersion: 0 },
        { id: 'a2', budgetId: 'multi', categoryId: 'c2', amount: 100, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, syncVersion: 0 },
      ],
    });
    const activeProgress = makeProgress(activeBudget, {
      categoryBreakdown: [
        { categoryId: 'c1', categoryName: 'Food', allocated: 100, spent: 120, remaining: 0, percentageUsed: 120, isOverBudget: true },
        { categoryId: 'c2', categoryName: 'Fun', allocated: 100, spent: 40, remaining: 60, percentageUsed: 40, isOverBudget: false },
      ],
    });

    const inactiveBudget = makeBudget({ id: 'inactive-multi', isActive: false });
    const inactiveProgress = makeProgress(inactiveBudget, {
      categoryBreakdown: [
        { categoryId: 'c3', categoryName: 'Travel', allocated: 100, spent: 200, remaining: 0, percentageUsed: 200, isOverBudget: true },
      ],
    });

    const classified: ClassifiedBudget[] = [
      classifyBudget(activeBudget, activeProgress),
      classifyBudget(inactiveBudget, inactiveProgress),
    ];

    expect(countCategoriesOverAllocation(classified)).toBe(1);
  });

  it('is independent of whether the parent budget total is over', () => {
    const budget = makeBudget({ amount: 1000 });
    const progress = makeProgress(budget, {
      percentageUsed: 30,
      isOverBudget: false,
      categoryBreakdown: [
        { categoryId: 'c1', categoryName: 'Food', allocated: 100, spent: 150, remaining: 0, percentageUsed: 150, isOverBudget: true },
      ],
    });
    expect(countCategoriesOverAllocation([classifyBudget(budget, progress)])).toBe(1);
  });

  it('returns 0 when nothing is over', () => {
    expect(countCategoriesOverAllocation([classifyBudget(makeBudget(), makeProgress(makeBudget()))])).toBe(0);
  });
});
