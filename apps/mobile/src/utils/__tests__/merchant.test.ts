import { getDistinctMerchants, getMerchantCounts, resolveExistingMerchant } from '../merchant';
import type { Expense } from '@budget/shared-types';

const make = (merchant?: string, isDeleted = false) =>
  ({ merchant, isDeleted } as unknown as Expense);

describe('getDistinctMerchants', () => {
  it('returns trimmed, de-duplicated (case-insensitive), sorted merchants', () => {
    const expenses = [
      make('Lidl'), make('biedronka'), make('lidl'),
      make('  '), make(undefined), make('Żabka'),
    ];
    expect(getDistinctMerchants(expenses)).toEqual(['biedronka', 'Lidl', 'Żabka']);
  });
  it('skips deleted expenses', () => {
    const expenses = [make('Lidl', true), make('Rossmann')];
    expect(getDistinctMerchants(expenses)).toEqual(['Rossmann']);
  });
});

describe('getMerchantCounts', () => {
  const m = (merchant?: string, isDeleted = false) =>
    ({ merchant, isDeleted } as unknown as import('@budget/shared-types').Expense);
  it('counts by exact value, skips deleted/blank, sorts by count desc then name', () => {
    const expenses = [
      m('Lidl'), m('Lidl'), m('Biedronka'), m('Biedronka'), m('Biedronka'),
      m('  '), m(undefined), m('Lidl', true),
    ];
    expect(getMerchantCounts(expenses)).toEqual([
      { merchant: 'Biedronka', count: 3 },
      { merchant: 'Lidl', count: 2 },
    ]);
  });
});

describe('resolveExistingMerchant', () => {
  it('snaps to existing canonical on case/space-insensitive exact match', () => {
    expect(resolveExistingMerchant('zabka zf351 ', ['Zabka ZF351', 'Lidl'])).toBe('Zabka ZF351');
  });
  it('returns trimmed input when no match', () => {
    expect(resolveExistingMerchant('  New Shop ', ['Lidl'])).toBe('New Shop');
  });
  it('returns empty string for blank/nullish', () => {
    expect(resolveExistingMerchant('   ', ['Lidl'])).toBe('');
    expect(resolveExistingMerchant(null, ['Lidl'])).toBe('');
    expect(resolveExistingMerchant(undefined, ['Lidl'])).toBe('');
  });
});
