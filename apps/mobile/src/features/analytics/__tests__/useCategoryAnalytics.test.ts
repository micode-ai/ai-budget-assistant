import { computeVsAverage, groupExpensesByCategory, type SplittableExpense } from '../categoryGrouping';
import type { ExpenseCategorySplit } from '@budget/shared-types';

const identity = (amount: number) => amount;

let splitSeq = 0;
function makeSplit(
  categoryId: string,
  amount: number,
  percentage: number,
  overrides: Partial<ExpenseCategorySplit> = {},
): ExpenseCategorySplit {
  splitSeq += 1;
  return {
    id: `split-${splitSeq}`,
    expenseId: 'e1',
    categoryId,
    amount,
    percentage,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    isDeleted: false,
    syncVersion: 0,
    ...overrides,
  };
}

function makeExpense(overrides: Partial<SplittableExpense> = {}): SplittableExpense {
  return {
    categoryId: 'c-food',
    currencyCode: 'USD',
    amount: 100,
    ...overrides,
  };
}

describe('category grouping with splits', () => {
  it('attributes a split expense to each of its categories', () => {
    // one 240 expense, categoryId c-food, splits 180/35/25 → three rows.
    const expense = makeExpense({
      categoryId: 'c-food',
      amount: 240,
      splits: [
        makeSplit('c-food', 180, 75),
        makeSplit('c-transport', 35, 14.58),
        makeSplit('c-other', 25, 10.42),
      ],
    });

    const map = groupExpensesByCategory([expense], identity);

    expect(map.size).toBe(3);
    expect(map.get('c-food')).toBe(180);
    expect(map.get('c-transport')).toBe(35);
    expect(map.get('c-other')).toBe(25);
    // The parent categoryId never additionally receives the full 240 — that
    // would double count the categories the split moved money into.
    expect([...map.values()].reduce((sum, v) => sum + v, 0)).toBe(240);
  });

  it('falls back to the expense category when there are no splits', () => {
    // unchanged behaviour for every existing expense.
    const noSplitsField = makeExpense({ categoryId: 'c-food', amount: 100 });
    const emptySplitsArray = makeExpense({ categoryId: 'c-transport', amount: 50, splits: [] });
    const uncategorized = makeExpense({ categoryId: undefined, amount: 10 });

    const map = groupExpensesByCategory([noSplitsField, emptySplitsArray, uncategorized], identity);

    expect(map.size).toBe(3);
    expect(map.get('c-food')).toBe(100);
    expect(map.get('c-transport')).toBe(50);
    expect(map.get(null)).toBe(10);
  });

  it('keeps the breakdown summing to the period total', () => {
    // Σ category amounts === Σ expense amounts.
    const expenses: SplittableExpense[] = [
      makeExpense({
        categoryId: 'c-food',
        amount: 240,
        splits: [
          makeSplit('c-food', 180, 75),
          makeSplit('c-transport', 35, 14.58),
          makeSplit('c-other', 25, 10.42),
        ],
      }),
      makeExpense({ categoryId: 'c-food', amount: 60 }),
      makeExpense({ categoryId: undefined, amount: 10 }),
    ];

    const periodTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const map = groupExpensesByCategory(expenses, identity);
    const groupedTotal = [...map.values()].reduce((sum, v) => sum + v, 0);

    expect(groupedTotal).toBe(periodTotal);
  });

  it('uses splits in the trailing-month average too', () => {
    // otherwise vsAverage compares a split month against unsplit history.
    //
    // The same 500 receipt is booked under categoryId 'c-food' every month
    // (current + all 3 trailing) but split 50/450 between food and
    // household. If the trailing months were grouped by the expense's own
    // categoryId (ignoring their own splits) instead of through this same
    // helper, each trailing month's "c-food" total would read the FULL 500 —
    // the receipt's own categoryId — while the current month correctly reads
    // only its 50 share. A flat, unchanging spending pattern would then be
    // reported as a huge fabricated drop instead of no change at all.
    const receipt = () =>
      makeExpense({
        categoryId: 'c-food',
        amount: 500,
        splits: [makeSplit('c-food', 50, 10), makeSplit('c-household', 450, 90)],
      });

    const currentAmount = groupExpensesByCategory([receipt()], identity).get('c-food')!;
    const monthlyTotals = [receipt(), receipt(), receipt()].map(
      (r) => groupExpensesByCategory([r], identity).get('c-food') || 0,
    );

    expect(currentAmount).toBe(50);
    expect(monthlyTotals).toEqual([50, 50, 50]);
    expect(computeVsAverage(currentAmount, monthlyTotals)).toBe(0);
  });
});

describe('computeVsAverage', () => {
  it('returns null when every trailing month is zero (no history to compare against)', () => {
    expect(computeVsAverage(100, [0, 0, 0])).toBeNull();
  });

  it('computes a signed percentage delta against the rolling average', () => {
    expect(computeVsAverage(150, [100, 100, 100])).toBe(50);
    expect(computeVsAverage(50, [100, 100, 100])).toBe(-50);
  });
});
