import { resolveBudgetName, type DefaultBudgetNameInput } from '../defaultBudgetName';

const names: Record<string, string> = { food: 'Groceries', fun: 'Entertainment' };
const base: DefaultBudgetNameInput = {
  typed: '',
  mode: 'overall',
  period: 'monthly',
  selectedCategoryId: '',
  allocationCategoryIds: [],
  categoryName: (id) => names[id],
  periodName: (p) => `${p} budget`,
};

describe('resolveBudgetName', () => {
  it('keeps what the user typed, trimmed', () => {
    expect(resolveBudgetName({ ...base, typed: '  Holiday  ', selectedCategoryId: 'food' })).toBe('Holiday');
  });

  it('names an overall budget after its period when no category is picked', () => {
    expect(resolveBudgetName({ ...base, typed: '   ', period: 'weekly' })).toBe('weekly budget');
  });

  it('names a single-category budget after the category', () => {
    expect(resolveBudgetName({ ...base, selectedCategoryId: 'food' })).toBe('Groceries');
    expect(resolveBudgetName({ ...base, mode: 'byCategory', allocationCategoryIds: ['fun'] })).toBe('Entertainment');
  });

  it('falls back to the period for several allocations or an unknown category', () => {
    expect(resolveBudgetName({ ...base, mode: 'byCategory', allocationCategoryIds: ['food', 'fun'] })).toBe(
      'monthly budget',
    );
    expect(resolveBudgetName({ ...base, selectedCategoryId: 'gone' })).toBe('monthly budget');
  });

  it('ignores the overall-mode pick while in by-category mode', () => {
    expect(resolveBudgetName({ ...base, mode: 'byCategory', selectedCategoryId: 'food' })).toBe('monthly budget');
  });
});
