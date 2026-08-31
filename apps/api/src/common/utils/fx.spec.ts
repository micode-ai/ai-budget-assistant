import { getRatesSafe, convertAmount, FxRateProvider } from './fx';

describe('getRatesSafe', () => {
  it('returns the provider rates for the requested base', async () => {
    const provider: FxRateProvider = {
      getRates: jest.fn().mockResolvedValue({ rates: { PLN: 4, EUR: 0.9 } }),
    };

    const rates = await getRatesSafe(provider, 'USD');

    expect(rates).toEqual({ PLN: 4, EUR: 0.9 });
    expect(provider.getRates).toHaveBeenCalledWith('USD');
  });

  it('returns null when the provider throws (rate outage never fails the caller)', async () => {
    const provider: FxRateProvider = {
      getRates: jest.fn().mockRejectedValue(new Error('provider down')),
    };

    await expect(getRatesSafe(provider, 'USD')).resolves.toBeNull();
  });

  it('returns null when the provider resolves with no rates', async () => {
    const provider: FxRateProvider = {
      getRates: jest.fn().mockResolvedValue({ rates: undefined as unknown as Record<string, number> }),
    };

    await expect(getRatesSafe(provider, 'USD')).resolves.toBeNull();
  });
});

describe('convertAmount', () => {
  const rates = { PLN: 4, EUR: 0.9 };

  it('returns the amount unchanged when from equals base, even with no rates', () => {
    expect(convertAmount(100, 'USD', 'USD', null)).toBe(100);
  });

  it('converts using the 1 base = rates[from] from convention', () => {
    // 1 USD = 4 PLN -> 40 PLN is 10 USD
    expect(convertAmount(40, 'PLN', 'USD', rates)).toBe(10);
  });

  it('rounds to 2 decimal places', () => {
    // 10 / 0.9 = 11.111...
    expect(convertAmount(10, 'EUR', 'USD', rates)).toBe(11.11);
  });

  it('returns null when rates are unavailable and currencies differ', () => {
    expect(convertAmount(40, 'PLN', 'USD', null)).toBeNull();
  });

  it('returns null when the rate for `from` is missing', () => {
    expect(convertAmount(40, 'GBP', 'USD', rates)).toBeNull();
  });

  it('returns null for a zero or negative rate rather than dividing by it', () => {
    expect(convertAmount(40, 'PLN', 'USD', { PLN: 0 })).toBeNull();
    expect(convertAmount(40, 'PLN', 'USD', { PLN: -4 })).toBeNull();
  });
});
