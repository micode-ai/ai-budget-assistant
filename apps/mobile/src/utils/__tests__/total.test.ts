jest.mock('@/stores/exchangeRateStore', () => ({
  convertAmount: (amount: number, from: string, to: string, rates: Record<string, number>) => {
    if (from === to) return amount;
    const fromRate = rates[from];
    const toRate = rates[to];
    if (!fromRate || fromRate === 0 || !toRate || toRate === 0) return amount;
    return (amount / fromRate) * toRate;
  },
}));

import { sumConverted } from '../total';

describe('sumConverted', () => {
  // rates are relative to base (USD): EUR 0.5 means 1 USD = 0.5 EUR
  const rates = { USD: 1, EUR: 0.5 };
  it('sums amounts converted to the base currency', () => {
    const items = [
      { amount: 100, currencyCode: 'USD' },
      { amount: 10, currencyCode: 'EUR' }, // 10 EUR -> 20 USD
    ];
    expect(sumConverted(items, 'USD', rates)).toBe(120);
  });
  it('returns 0 for an empty list', () => {
    expect(sumConverted([], 'USD', rates)).toBe(0);
  });
});
