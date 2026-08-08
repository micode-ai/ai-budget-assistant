import type { WalletSummary } from '@budget/shared-types';
import {
  exceedsAvailable,
  findCurrencyBalance,
  resolveAccountBalance,
} from '../transferBalances';

function summary(currencyCode: string, currentBalance: number): WalletSummary {
  return {
    currencyCode,
    initialAmount: 0,
    totalIncomes: 0,
    totalExpenses: 0,
    totalExchangedIn: 0,
    totalExchangedOut: 0,
    totalTransferredIn: 0,
    totalTransferredOut: 0,
    currentBalance,
  } as WalletSummary;
}

describe('findCurrencyBalance', () => {
  it('returns null rather than zero when the currency is absent', () => {
    expect(findCurrencyBalance([summary('PLN', 100)], 'EUR')).toBeNull();
    expect(findCurrencyBalance(undefined, 'PLN')).toBeNull();
  });

  it('returns a real zero balance', () => {
    expect(findCurrencyBalance([summary('PLN', 0)], 'PLN')).toBe(0);
  });
});

describe('resolveAccountBalance', () => {
  const sources = {
    accountSummaries: {
      personal: [summary('PLN', 111)],
      savings: [summary('PLN', 5000), summary('EUR', 200)],
    },
    localSummary: [summary('PLN', 3450)],
    currentAccountId: 'personal',
  };

  it('prefers the locally computed summary for the current account', () => {
    // Local SQLite is exact and offline-safe; the cached server copy may be stale.
    expect(resolveAccountBalance(sources, 'personal', 'PLN')).toBe(3450);
  });

  it('falls back to the server summary when the current account lacks that currency', () => {
    expect(resolveAccountBalance(sources, 'personal', 'EUR')).toBeNull();
  });

  it('uses the server summary for other accounts', () => {
    expect(resolveAccountBalance(sources, 'savings', 'EUR')).toBe(200);
  });

  it('returns null for an account with no data at all', () => {
    expect(resolveAccountBalance(sources, 'vacation', 'PLN')).toBeNull();
    expect(resolveAccountBalance(sources, '', 'PLN')).toBeNull();
  });
});

describe('exceedsAvailable', () => {
  it('warns only when the amount is above a known balance', () => {
    expect(exceedsAvailable(500, 400)).toBe(true);
    expect(exceedsAvailable(400, 400)).toBe(false);
    expect(exceedsAvailable(100, 400)).toBe(false);
  });

  it('stays silent when the balance is unknown', () => {
    expect(exceedsAvailable(9999, null)).toBe(false);
  });

  it('stays silent on an empty or invalid amount', () => {
    expect(exceedsAvailable(0, 10)).toBe(false);
    expect(exceedsAvailable(NaN, 10)).toBe(false);
  });
});
