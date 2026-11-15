import { groupMerchants } from '../merchantGrouping';

const convert = (r: { amount: number; currencyCode: string }) => (r.currencyCode === 'EUR' ? r.amount * 4 : r.amount);

describe('groupMerchants', () => {
  it('merges spellings that differ only in case and edge spaces', () => {
    const groups = groupMerchants(
      [
        { merchant: 'Lidl', amount: 10, currencyCode: 'PLN' },
        { merchant: 'LIDL', amount: 20, currencyCode: 'PLN' },
        { merchant: 'lidl ', amount: 30, currencyCode: 'PLN' },
        { merchant: 'Lidl', amount: 40, currencyCode: 'PLN' },
      ],
      convert,
    );
    expect(groups).toEqual([{ merchant: 'Lidl', amount: 100, visits: 4, averageTicket: 25 }]);
  });

  it('labels a group with its most common spelling, first seen on a tie', () => {
    const [g] = groupMerchants(
      [
        { merchant: 'ZABKA', amount: 1, currencyCode: 'PLN' },
        { merchant: 'Zabka', amount: 1, currencyCode: 'PLN' },
      ],
      convert,
    );
    expect(g.merchant).toBe('ZABKA');
  });

  it('converts, skips rows without a merchant and sorts by amount', () => {
    const groups = groupMerchants(
      [
        { merchant: 'Cafe', amount: 5, currencyCode: 'EUR' },
        { merchant: '  ', amount: 999, currencyCode: 'PLN' },
        { merchant: null, amount: 999, currencyCode: 'PLN' },
        { merchant: 'Shop', amount: 10, currencyCode: 'PLN' },
      ],
      convert,
    );
    expect(groups.map((g) => [g.merchant, g.amount])).toEqual([
      ['Cafe', 20],
      ['Shop', 10],
    ]);
  });
});
