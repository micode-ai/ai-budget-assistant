import { computeShoppingListTotals, lineTotal, parsePriceInput } from '../listTotals';

describe('lineTotal', () => {
  it('multiplies price by quantity', () => {
    expect(lineTotal({ unitPrice: 2.5, quantity: 3 })).toBe(7.5);
  });
  it('returns null for an unpriced item', () => {
    expect(lineTotal({ unitPrice: null, quantity: 3 })).toBeNull();
  });
  it('rounds to cents', () => {
    expect(lineTotal({ unitPrice: 0.1, quantity: 3 })).toBe(0.3);
  });
});

describe('computeShoppingListTotals', () => {
  it('sums priced items and splits out what is still unchecked', () => {
    const totals = computeShoppingListTotals([
      { unitPrice: 4, quantity: 2, isChecked: false },
      { unitPrice: 10, quantity: 1, isChecked: true },
      { unitPrice: null, quantity: 1, isChecked: false },
    ]);
    expect(totals).toEqual({ total: 18, remaining: 8, unpricedCount: 1, hasAnyPrice: true });
  });

  it('reports no price at all for an unpriced list', () => {
    const totals = computeShoppingListTotals([{ unitPrice: null, quantity: 1, isChecked: false }]);
    expect(totals.hasAnyPrice).toBe(false);
    expect(totals.total).toBe(0);
  });

  it('counts a price of zero as priced', () => {
    const totals = computeShoppingListTotals([{ unitPrice: 0, quantity: 1, isChecked: false }]);
    expect(totals.hasAnyPrice).toBe(true);
    expect(totals.unpricedCount).toBe(0);
  });

  it('avoids floating-point noise in the sum', () => {
    const totals = computeShoppingListTotals([
      { unitPrice: 0.1, quantity: 1, isChecked: false },
      { unitPrice: 0.2, quantity: 1, isChecked: false },
    ]);
    expect(totals.total).toBe(0.3);
  });
});

describe('parsePriceInput', () => {
  it('accepts a dot or a comma', () => {
    expect(parsePriceInput('12.5')).toBe(12.5);
    expect(parsePriceInput('12,99')).toBe(12.99);
  });
  it('treats an empty field as clearing the price', () => {
    expect(parsePriceInput('  ')).toBeNull();
  });
  it('rejects junk, negatives and more than two decimals', () => {
    expect(parsePriceInput('abc')).toBeUndefined();
    expect(parsePriceInput('-3')).toBeUndefined();
    expect(parsePriceInput('1.234')).toBeUndefined();
  });
  it('ignores thousands spaces', () => {
    expect(parsePriceInput('1 200')).toBe(1200);
  });
});
