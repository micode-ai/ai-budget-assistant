import { resolveMonthlyBudgetSegments } from '../monthlyBudgetSegments';
import type { Budget, BudgetCategoryAllocation, BudgetProgress } from '@budget/shared-types';

function makeAllocation(overrides: Partial<BudgetCategoryAllocation> = {}): BudgetCategoryAllocation {
  return {
    id: 'alloc1',
    budgetId: 'b1',
    categoryId: 'cat1',
    amount: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    syncVersion: 0,
    ...overrides,
  };
}

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    localId: 'b1',
    userId: 'u1',
    accountId: 'a1',
    name: 'Monthly budget',
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

describe('resolveMonthlyBudgetSegments', () => {
  it('returns segments for a single active, category-allocated monthly budget', () => {
    // Fails if the single-budget branch stops passing through the budget's
    // own categoryBreakdown/amount/percentageUsed/currencyCode — e.g.
    // returning `null` here, or substituting a hardcoded/blended value
    // instead of this budget's actual progress.
    const budget = makeBudget({
      id: 'b1',
      amount: 500,
      currencyCode: 'EUR',
      categoryAllocations: [makeAllocation({ categoryId: 'cat1' }), makeAllocation({ categoryId: 'cat2' })],
    });
    const breakdown = [
      {
        categoryId: 'cat1',
        categoryName: 'Groceries',
        categoryColor: '#ff0000',
        allocated: 300,
        spent: 150,
        remaining: 150,
        percentageUsed: 50,
        isOverBudget: false,
      },
      {
        categoryId: 'cat2',
        categoryName: 'Transport',
        allocated: 200,
        spent: 220,
        remaining: 0,
        percentageUsed: 110,
        isOverBudget: true,
      },
    ];
    const progress = makeProgress(budget, { spent: 370, percentageUsed: 74, categoryBreakdown: breakdown });
    const getBudgetProgress = jest.fn().mockReturnValue(progress);

    const result = resolveMonthlyBudgetSegments([budget], getBudgetProgress);

    expect(getBudgetProgress).toHaveBeenCalledWith('b1');
    expect(result).toEqual({
      categories: breakdown,
      totalAmount: 500,
      percentageUsed: 74,
      currencyCode: 'EUR',
    });
  });

  it('returns null when more than one active, category-allocated monthly budget contributes (the merged case)', () => {
    // Fails if the "exactly one contributing budget" gate is removed or
    // loosened — e.g. picking the first of several budgets and returning
    // its segments alone, which would silently misrepresent a blended
    // total as one budget's own breakdown.
    const budgetA = makeBudget({ id: 'b1', categoryAllocations: [makeAllocation({ budgetId: 'b1' })] });
    const budgetB = makeBudget({ id: 'b2', categoryAllocations: [makeAllocation({ budgetId: 'b2' })] });
    const getBudgetProgress = jest.fn().mockImplementation((id: string) =>
      makeProgress(id === 'b1' ? budgetA : budgetB, {
        categoryBreakdown: [
          {
            categoryId: 'cat1',
            categoryName: 'Groceries',
            allocated: 200,
            spent: 50,
            remaining: 150,
            percentageUsed: 25,
            isOverBudget: false,
          },
        ],
      }),
    );

    const result = resolveMonthlyBudgetSegments([budgetA, budgetB], getBudgetProgress);

    expect(result).toBeNull();
  });

  it('returns null when there are no budgets at all', () => {
    // Fails if the merged-case guard is loosened to only reject the upper
    // bound (`length > 1` instead of `!== 1`) — zero budgets would then
    // fall through to `const [budget] = activeMonthly`, `budget` would be
    // `undefined`, and `getBudgetProgress(budget.id)` throws. Confirmed by
    // deliberately making that exact change: this test alone failed (with
    // that TypeError), all four others stayed green. Also asserts progress
    // is never looked up for an empty input.
    const getBudgetProgress = jest.fn();

    const result = resolveMonthlyBudgetSegments([], getBudgetProgress);

    expect(result).toBeNull();
    expect(getBudgetProgress).not.toHaveBeenCalled();
  });

  it("returns null for a single 'overall' (category-less) monthly budget, even if its progress carries a breakdown", () => {
    // Fails if the explicit "does this budget have its own allocations"
    // check is dropped in favour of trusting whatever `categoryBreakdown`
    // the progress lookup happens to return — an overall budget has
    // nothing to segment BY DEFINITION (design: "an overall budget by
    // definition has no allocations"), so this must hold even against a
    // progress result that (wrongly, as no real `getBudgetProgress` would)
    // reports one anyway. Confirmed by deliberately deleting the "overall"
    // check and keeping only the length and categoryBreakdown-presence
    // guards: only this test failed (a non-null result), all four others
    // stayed green — the breakdown supplied here is what forces this
    // check to be doing real work, rather than being silently shadowed by
    // the categoryBreakdown-presence guard below it.
    const overallBudget = makeBudget({ id: 'b1', categoryAllocations: [] });
    const suspiciousBreakdown = [
      {
        categoryId: 'cat1',
        categoryName: 'Groceries',
        allocated: 200,
        spent: 50,
        remaining: 150,
        percentageUsed: 25,
        isOverBudget: false,
      },
    ];
    const getBudgetProgress = jest
      .fn()
      .mockReturnValue(makeProgress(overallBudget, { categoryBreakdown: suspiciousBreakdown }));

    const result = resolveMonthlyBudgetSegments([overallBudget], getBudgetProgress);

    expect(result).toBeNull();
  });

  it('ignores inactive and soft-deleted budgets when deciding whether exactly one contributes', () => {
    // Fails if the active-monthly filter drops `isActive`/`isDeleted`
    // (or the `period === 'monthly'` check) — an inactive or non-monthly
    // budget with its own allocations would then count as a second
    // contributor and wrongly collapse a genuine single-budget case into
    // the merged (null) case.
    const live = makeBudget({ id: 'b1', categoryAllocations: [makeAllocation({ budgetId: 'b1' })] });
    const inactive = makeBudget({ id: 'b2', isActive: false, categoryAllocations: [makeAllocation({ budgetId: 'b2' })] });
    const deleted = makeBudget({ id: 'b3', isDeleted: true, categoryAllocations: [makeAllocation({ budgetId: 'b3' })] });
    const yearly = makeBudget({ id: 'b4', period: 'yearly', categoryAllocations: [makeAllocation({ budgetId: 'b4' })] });
    const breakdown = [
      {
        categoryId: 'cat1',
        categoryName: 'Groceries',
        allocated: 500,
        spent: 100,
        remaining: 400,
        percentageUsed: 20,
        isOverBudget: false,
      },
    ];
    const getBudgetProgress = jest.fn().mockReturnValue(makeProgress(live, { categoryBreakdown: breakdown }));

    const result = resolveMonthlyBudgetSegments([live, inactive, deleted, yearly], getBudgetProgress);

    expect(getBudgetProgress).toHaveBeenCalledTimes(1);
    expect(getBudgetProgress).toHaveBeenCalledWith('b1');
    expect(result?.categories).toEqual(breakdown);
  });
});
