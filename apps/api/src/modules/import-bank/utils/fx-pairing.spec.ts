import { pairFxRows } from './fx-pairing';
import type { ImportRow } from '@budget/shared-types';

const row = (over: Partial<ImportRow>): ImportRow => ({
  idx: 0,
  kind: 'expense',
  date: '2026-01-15',
  amount: 0,
  currencyCode: 'PLN',
  description: '',
  externalRef: '',
  alreadyImported: false,
  ...over,
});

describe('pairFxRows', () => {
  it('returns input unchanged when no FX pairs exist', () => {
    const rows = [row({ idx: 1, kind: 'expense', amount: 50, currencyCode: 'PLN' })];
    expect(pairFxRows(rows, 'mbank')).toHaveLength(1);
  });

  it('pairs opposite-sign rows on same date with different currency', () => {
    const rows = [
      row({ idx: 1, kind: 'expense', amount: 100, currencyCode: 'PLN', description: 'Wymiana waluty' }),
      row({ idx: 2, kind: 'income', amount: 22, currencyCode: 'EUR', description: 'Wymiana waluty' }),
    ];
    const out = pairFxRows(rows, 'mbank');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('fx');
    expect(out[0].fxFromCurrency).toBe('PLN');
    expect(out[0].fxToCurrency).toBe('EUR');
    expect(out[0].fxFromAmount).toBe(100);
    expect(out[0].fxToAmount).toBe(22);
  });

  it('pairs same-currency rows when description has FX keyword', () => {
    const rows = [
      row({ idx: 1, kind: 'expense', amount: 50, currencyCode: 'PLN', description: 'Przewalutowanie' }),
      row({ idx: 2, kind: 'income', amount: 50, currencyCode: 'PLN', description: 'Przewalutowanie' }),
    ];
    // Same currency PLN→PLN: skip pairing per spec edge case
    expect(pairFxRows(rows, 'mbank')).toHaveLength(2);
  });

  it('does not pair if dates differ', () => {
    const rows = [
      row({ idx: 1, date: '2026-01-15', kind: 'expense', amount: 100, currencyCode: 'PLN', description: 'Wymiana' }),
      row({ idx: 2, date: '2026-01-16', kind: 'income', amount: 22, currencyCode: 'EUR', description: 'Wymiana' }),
    ];
    expect(pairFxRows(rows, 'mbank')).toHaveLength(2);
  });
});
