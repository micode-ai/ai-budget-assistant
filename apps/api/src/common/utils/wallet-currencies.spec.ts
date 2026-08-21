import { resolveWalletCurrencies } from './wallet-currencies';

describe('resolveWalletCurrencies', () => {
  it('keeps a live wallet row even when it has no movements at all', () => {
    const resolved = resolveWalletCurrencies(
      [{ currencyCode: 'PLN', isDeleted: false, initialAmount: 500 }],
      [],
    );

    expect(resolved).toEqual([{ currencyCode: 'PLN', initialAmount: 500, derived: false }]);
  });

  it('surfaces a currency that has movements but no wallet row, with a zero initial amount', () => {
    const resolved = resolveWalletCurrencies(
      [{ currencyCode: 'PLN', isDeleted: false, initialAmount: 0 }],
      ['PLN', 'USD'],
    );

    expect(resolved).toEqual([
      { currencyCode: 'PLN', initialAmount: 0, derived: false },
      { currencyCode: 'USD', initialAmount: 0, derived: true },
    ]);
  });

  it('keeps a currency the user hid out of the wallet even though it still has movements', () => {
    const resolved = resolveWalletCurrencies(
      [
        { currencyCode: 'PLN', isDeleted: false, initialAmount: 0 },
        { currencyCode: 'BYN', isDeleted: true, initialAmount: 0 },
      ],
      ['PLN', 'BYN'],
    );

    expect(resolved.map((r) => r.currencyCode)).toEqual(['PLN']);
  });

  it('returns currencies in a deterministic alphabetical order regardless of input order', () => {
    const resolved = resolveWalletCurrencies(
      [{ currencyCode: 'USD', isDeleted: false, initialAmount: 10 }],
      ['PLN', 'EUR', 'USD'],
    );

    expect(resolved.map((r) => r.currencyCode)).toEqual(['EUR', 'PLN', 'USD']);
  });

  it('does not duplicate a currency that appears repeatedly in the movement list', () => {
    const resolved = resolveWalletCurrencies([], ['USD', 'USD', 'USD']);

    expect(resolved).toEqual([{ currencyCode: 'USD', initialAmount: 0, derived: true }]);
  });

  it('ignores blank movement currencies instead of emitting an empty-code balance card', () => {
    const resolved = resolveWalletCurrencies([], ['', '   ', 'USD']);

    expect(resolved.map((r) => r.currencyCode)).toEqual(['USD']);
  });

  it('returns nothing for an account with neither wallet rows nor movements', () => {
    expect(resolveWalletCurrencies([], [])).toEqual([]);
  });
});
