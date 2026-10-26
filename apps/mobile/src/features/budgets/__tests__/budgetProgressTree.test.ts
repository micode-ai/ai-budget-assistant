/**
 * Mirrors apps/api budgets.service.spec.ts "parent allocation rolls up
 * subcategories": the phone must produce the same numbers for the same data.
 */
const mockExpenses: { current: any[] } = { current: [] };
const mockCategories: { current: any[] } = { current: [] };

jest.mock('../../../stores/expenseStore', () => ({
  useExpenseStore: { getState: () => ({ expenses: mockExpenses.current }) },
}));
jest.mock('../../../stores/categoryStore', () => ({
  useCategoryStore: { getState: () => ({ categories: mockCategories.current }) },
}));
jest.mock('../../../stores/exchangeRateStore', () => ({
  useExchangeRateStore: { getState: () => ({ rates: {}, baseCurrency: 'PLN' }) },
}));
jest.mock('@/hooks/useFinancialMonth', () => ({ readAnchorDay: () => null }));
jest.mock('@/utils/entityLabel', () => ({
  categoryLabel: (c: { name?: string } | undefined) => c?.name ?? 'Uncategorized',
}));

import { computeBudgetProgress } from '../../../stores/budgetProgress';

const P = 'cat-parent';
const C = 'cat-child';
const tree = [
  { id: P, parentId: null, isDeleted: false, name: 'Food', color: '#111' },
  { id: C, parentId: P, isDeleted: false, name: 'Cafe', color: '#222' },
];
const row = (categoryId: string, amount: number) => ({
  id: `${categoryId}-${amount}`,
  amount,
  date: '2026-09-05T12:00:00Z',
  categoryId,
  currencyCode: 'PLN',
});
const budgetFor = (allocIds: string[]): any => ({
  id: 'b1',
  amount: 1000,
  currencyCode: 'PLN',
  period: 'monthly',
  startDate: '2026-01-01T00:00:00Z',
  endDate: null,
  isActive: true,
  isDeleted: false,
  categoryAllocations: allocIds.map((categoryId) => ({ categoryId, amount: 500 })),
});
const run = (allocIds: string[], rows: any[]) => {
  mockCategories.current = tree;
  mockExpenses.current = rows;
  return computeBudgetProgress([budgetFor(allocIds)], 'b1', new Date('2026-09-20T12:00:00Z'))!;
};

describe('computeBudgetProgress — parent allocation rolls up subcategories', () => {
  it('counts a child expense in the parent line and lists the child', () => {
    const line = run([P], [row(P, 40), row(C, 25)]).categoryBreakdown![0];
    expect(line.spent).toBe(65);
    expect(line.ownSpent).toBe(40);
    expect(line.subcategories).toEqual([
      { categoryId: C, categoryName: 'Cafe', categoryColor: '#222', spent: 25 },
    ]);
  });

  it('counts an unallocated child of an allocated parent in the total once', () => {
    expect(run([P], [row(C, 25)]).spent).toBe(25);
  });

  it('counts the child once overall when both allocated, both lines show it', () => {
    const progress = run([P, C], [row(P, 40), row(C, 25)]);
    const byId = new Map(progress.categoryBreakdown!.map((l) => [l.categoryId, l.spent]));
    expect(progress.spent).toBe(65);
    expect(byId.get(P)).toBe(65);
    expect(byId.get(C)).toBe(25);
  });

  it('a receipt split into a parent part and a child part counts both in the parent line, once overall', () => {
    // Same fixture and numbers as the API's budgets.service.spec.ts.
    const receipt = {
      ...row(P, 100),
      splits: [
        { categoryId: P, amount: 60 },
        { categoryId: C, amount: 40 },
      ],
    };
    const progress = run([P], [receipt]);
    const line = progress.categoryBreakdown![0];
    expect(progress.spent).toBe(100);
    expect(line.spent).toBe(100);
    expect(line.ownSpent).toBe(60);
    expect(line.subcategories).toEqual([
      { categoryId: C, categoryName: 'Cafe', categoryColor: '#222', spent: 40 },
    ]);
  });
});
