import { buildWalletSummary } from '../walletSummary';

const NO_TOTALS = {
  incomeTotals: {},
  expenseTotals: {},
  exchangedIn: {},
  exchangedOut: {},
  transferredIn: {},
  transferredOut: {},
};

describe('buildWalletSummary', () => {
  it('surfaces a currency that only exists in the transactions, with a zero initial amount', () => {
    const summary = buildWalletSummary(
      [{ currencyCode: 'PLN', initialAmount: 0, isDeleted: false }],
      { ...NO_TOTALS, incomeTotals: { USD: 126500 }, expenseTotals: { USD: 2016 } },
    );

    const usd = summary.find((s) => s.currencyCode === 'USD');
    expect(usd?.initialAmount).toBe(0);
    expect(usd?.currentBalance).toBe(124484);
  });

  it('keeps a currency the user hid out of the wallet even though it still has movements', () => {
    const summary = buildWalletSummary(
      [
        { currencyCode: 'PLN', initialAmount: 0, isDeleted: false },
        { currencyCode: 'BYN', initialAmount: 0, isDeleted: true },
      ],
      { ...NO_TOTALS, expenseTotals: { BYN: 349 } },
    );

    expect(summary.map((s) => s.currencyCode)).toEqual(['PLN']);
  });

  it('keeps a currency the user set a balance for even when it has no movements', () => {
    const summary = buildWalletSummary(
      [{ currencyCode: 'GBP', initialAmount: 250, isDeleted: false }],
      NO_TOTALS,
    );

    expect(summary).toHaveLength(1);
    expect(summary[0].currentBalance).toBe(250);
  });

  it('applies every money source to the balance of a derived currency', () => {
    const summary = buildWalletSummary([], {
      incomeTotals: { EUR: 100 },
      expenseTotals: { EUR: 10 },
      exchangedIn: { EUR: 30 },
      exchangedOut: { EUR: 5 },
      transferredIn: { EUR: 8 },
      transferredOut: { EUR: 3 },
    });

    expect(summary[0]).toMatchObject({
      currencyCode: 'EUR',
      totalIncomes: 100,
      totalExpenses: 10,
      totalExchangedIn: 30,
      totalExchangedOut: 5,
      totalTransferredIn: 8,
      totalTransferredOut: 3,
      currentBalance: 120,
    });
  });
});
