import { applyCurrencyOverride } from '../applyCurrencyOverride';
import type { ImportRow } from '@budget/shared-types';

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  idx: 3,
  kind: 'expense',
  date: '2026-01-01',
  amount: 12.5,
  currencyCode: 'PLN',
  description: 'Test row',
  externalRef: 'ref-1',
  alreadyImported: false,
  ...over,
});

describe('applyCurrencyOverride', () => {
  it('returns the input unchanged when override is null', () => {
    const rows = [row()];
    expect(applyCurrencyOverride(rows, null)).toBe(rows);
  });

  it('rewrites every row currencyCode to the override', () => {
    const rows = [row({ currencyCode: 'PLN', idx: 1 }), row({ currencyCode: 'EUR', idx: 2 })];
    const out = applyCurrencyOverride(rows, 'USD');
    expect(out.every((r) => r.currencyCode === 'USD')).toBe(true);
  });

  it('preserves idx on every row', () => {
    const rows = [row({ idx: 1 }), row({ idx: 2 }), row({ idx: 3 })];
    const out = applyCurrencyOverride(rows, 'GBP');
    expect(out.map((r) => r.idx)).toEqual([1, 2, 3]);
  });

  it('leaves every other field untouched', () => {
    const rows = [row({ merchant: 'Biedronka', description: 'Groceries', amount: 42 })];
    const out = applyCurrencyOverride(rows, 'EUR');
    expect(out[0]).toEqual({ ...rows[0], currencyCode: 'EUR' });
  });
});
