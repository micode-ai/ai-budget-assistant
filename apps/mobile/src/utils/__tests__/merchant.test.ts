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

import { merchantFingerprint, suggestMerchantGroups } from '../merchant';

describe('merchantFingerprint', () => {
  it('keys on the first significant (>=4 char) token, ignoring numbers/city', () => {
    expect(merchantFingerprint('BIEDRONKA 1234 WARSZAWA')).toBe('BIEDRONKA');
    expect(merchantFingerprint('Biedronka 5678 Krakow')).toBe('BIEDRONKA');
  });
  it('returns empty when there is no significant token', () => {
    expect(merchantFingerprint('12 99')).toBe('');
    expect(merchantFingerprint('PL 1')).toBe('');
  });
});

describe('suggestMerchantGroups', () => {
  it('groups variants sharing a fingerprint (>=2 members), canonical = title-cased brand', () => {
    const groups = suggestMerchantGroups([
      { merchant: 'BIEDRONKA 1234 WARSZAWA', count: 5 },
      { merchant: 'BIEDRONKA 5678 KRAKOW', count: 3 },
      { merchant: 'Lidl', count: 10 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical).toBe('Biedronka');
    expect(groups[0].members).toEqual(['BIEDRONKA 1234 WARSZAWA', 'BIEDRONKA 5678 KRAKOW']);
    expect(groups[0].totalCount).toBe(8);
  });
  it('does not suggest singletons', () => {
    expect(suggestMerchantGroups([{ merchant: 'Lidl', count: 2 }])).toEqual([]);
  });
  it('sorts groups by total count desc', () => {
    const groups = suggestMerchantGroups([
      { merchant: 'ROSSMANN 1', count: 1 },
      { merchant: 'ROSSMANN 2', count: 1 },
      { merchant: 'BIEDRONKA A', count: 5 },
      { merchant: 'BIEDRONKA B', count: 5 },
    ]);
    expect(groups.map((g) => g.canonical)).toEqual(['Biedronka', 'Rossmann']);
  });
});
