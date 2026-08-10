import { findStatementBalances, reconcile } from './balance-check';
import type { ExtractedRow } from './statement-ai.validator';

const row = (amount: number): ExtractedRow => ({
  date: '2026-01-15', amount, currencyCode: 'PLN', description: 'x',
});

describe('findStatementBalances', () => {
  it('reads Polish opening and closing balance labels', () => {
    const text = 'Saldo poczatkowe: 1 000,00 PLN\n...\nSaldo koncowe: 850,50 PLN';
    expect(findStatementBalances(text)).toEqual({ opening: 1000, closing: 850.5 });
  });

  it('reads English labels with a dot decimal separator', () => {
    const text = 'Opening balance 1,000.00\nClosing balance 850.50';
    expect(findStatementBalances(text)).toEqual({ opening: 1000, closing: 850.5 });
  });

  it('returns null when only one of the two is present', () => {
    expect(findStatementBalances('Saldo poczatkowe: 1 000,00')).toBeNull();
  });

  it('returns null when neither is present', () => {
    expect(findStatementBalances('just some transactions')).toBeNull();
  });

  it('preserves the sign of a negative closing balance', () => {
    const text = 'Saldo poczatkowe: 1 000,00 PLN\nSaldo koncowe: -850,50 PLN';
    expect(findStatementBalances(text)).toEqual({ opening: 1000, closing: -850.5 });
  });

  it('disambiguates a single separator by occurrence count and trailing digit count', () => {
    // One occurrence, exactly 3 trailing digits -> thousands grouping, whichever character is used.
    expect(findStatementBalances('Opening balance 1,000\nClosing balance 500.00')).toEqual({
      opening: 1000,
      closing: 500,
    });
    expect(findStatementBalances('Opening balance 1.000\nClosing balance 500,00')).toEqual({
      opening: 1000,
      closing: 500,
    });
    // One occurrence, 2 trailing digits -> still the decimal separator.
    expect(findStatementBalances('Opening balance 1,00\nClosing balance 1,50')).toEqual({
      opening: 1,
      closing: 1.5,
    });
  });

  it('treats a repeated separator as thousands grouping even when a decimal point also appears', () => {
    expect(findStatementBalances('Opening balance 1,000,000.00\nClosing balance 500.00')).toEqual({
      opening: 1000000,
      closing: 500,
    });
  });

  it('takes the opening balance from the first occurrence and the closing balance from the last', () => {
    // Multi-page PDFs print a running balance on every page; only the first
    // "opening" and the last "closing" are the statement's true totals.
    const text = [
      'Opening balance 1 000,00 PLN',
      'Closing balance 400,00 PLN',
      'Page 2 of 3',
      'Closing balance 850,50 PLN',
    ].join('\n');
    expect(findStatementBalances(text)).toEqual({ opening: 1000, closing: 850.5 });
  });
});

describe('reconcile', () => {
  it('returns no_balance when there is nothing to check against', () => {
    expect(reconcile([row(-10)], null)).toBe('no_balance');
  });

  it('returns undefined when the sum matches within a cent', () => {
    expect(reconcile([row(-100), row(-49.5)], { opening: 1000, closing: 850.5 })).toBeUndefined();
  });

  it('returns balance_mismatch when rows are missing', () => {
    expect(reconcile([row(-100)], { opening: 1000, closing: 850.5 })).toBe('balance_mismatch');
  });

  it('tolerates floating point drift', () => {
    const rows = [row(-0.1), row(-0.2)];
    expect(reconcile(rows, { opening: 1, closing: 0.7 })).toBeUndefined();
  });
});
