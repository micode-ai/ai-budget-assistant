import type { AllAccountsAccountRow } from '@budget/shared-types';
import { sortAccounts } from '../accountSort';

const row = (o: Partial<AllAccountsAccountRow>): AllAccountsAccountRow =>
  ({
    id: 'a',
    name: 'A',
    type: 'personal',
    role: 'owner',
    included: true,
    encrypted: false,
    shared: false,
    spent: 0,
    income: 0,
    net: 0,
    prevSpent: null,
    prevIncome: null,
    ...o,
  }) as AllAccountsAccountRow;

const ids = (r: ReturnType<typeof sortAccounts>) => r.map((x) => x.account.id);

describe('sortAccounts', () => {
  const list = [
    row({ id: 'x', name: 'Excluded', included: false, spent: 9999 }),
    row({ id: 'a', name: 'bravo', spent: 10, prevSpent: 20 }),
    row({ id: 'b', name: 'Alpha', spent: 30, prevSpent: 20 }),
    row({ id: 'e', name: 'Enc', encrypted: true, spent: 5000 }),
    row({ id: 'c', name: 'Charlie', spent: 20, prevSpent: null }),
  ];

  it('keeps excluded and encrypted rows last in both directions, whatever their figures', () => {
    expect(ids(sortAccounts(list, 'spent', 'desc')).slice(-2)).toEqual(['x', 'e']);
    expect(ids(sortAccounts(list, 'spent', 'asc')).slice(-2)).toEqual(['x', 'e']);
  });

  it('sorts counted rows by the numeric key in the given direction', () => {
    expect(ids(sortAccounts(list, 'spent', 'desc')).slice(0, 3)).toEqual(['b', 'c', 'a']);
    expect(ids(sortAccounts(list, 'spent', 'asc')).slice(0, 3)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by name case-insensitively', () => {
    expect(ids(sortAccounts(list, 'name', 'asc')).slice(0, 3)).toEqual(['b', 'a', 'c']);
  });

  it('puts a row with no previous period below the rest when sorting by change, both directions', () => {
    expect(ids(sortAccounts(list, 'change', 'desc')).slice(0, 3)).toEqual(['b', 'a', 'c']);
    expect(ids(sortAccounts(list, 'change', 'asc')).slice(0, 3)).toEqual(['a', 'b', 'c']);
  });

  it('preserves the original index so a row keeps its colour', () => {
    const r = sortAccounts(list, 'spent', 'desc');
    expect(r[0]).toMatchObject({ index: 2 });
  });
});
