import { getDistinctMerchants } from '../merchant';
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
