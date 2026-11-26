import { formatCurrency, formatCompactCurrency, setAmountMask, withAmountsRevealed, AMOUNT_MASK } from '@budget/shared-utils';

describe('amount mask', () => {
  afterEach(() => setAmountMask(false));

  it('masks full and compact formats when on, leaves them alone when off', () => {
    expect(formatCurrency(12.5, 'USD')).toBe('$12.50');
    setAmountMask(true);
    expect(formatCurrency(12.5, 'USD')).toBe(AMOUNT_MASK);
    expect(formatCompactCurrency(5200, 'PLN')).toBe(AMOUNT_MASK);
  });

  it('withAmountsRevealed lifts the mask and restores it', () => {
    setAmountMask(true);
    expect(withAmountsRevealed(() => formatCurrency(1, 'USD'))).toBe('$1.00');
    expect(formatCurrency(1, 'USD')).toBe(AMOUNT_MASK);
  });
});
