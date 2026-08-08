import type { AccountTransfer } from '@budget/shared-types';
import { buildFrequentTransfers } from '../frequentTransfers';

const ACCOUNTS = ['personal', 'savings', 'vacation'];

function transfer(over: Partial<AccountTransfer> = {}): AccountTransfer {
  return {
    id: Math.random().toString(36).slice(2),
    localId: 'l',
    userId: 'u',
    fromAccountId: 'personal',
    fromCurrency: 'PLN',
    fromAmount: 2000,
    toAccountId: 'savings',
    toCurrency: 'PLN',
    toAmount: 2000,
    exchangeRate: 1,
    date: new Date('2026-01-10'),
    countAsIncome: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
    ...over,
  } as AccountTransfer;
}

describe('buildFrequentTransfers', () => {
  it('groups by route and counts occurrences', () => {
    const result = buildFrequentTransfers(
      [transfer(), transfer(), transfer({ toAccountId: 'vacation' })],
      { eligibleAccountIds: ACCOUNTS },
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ toAccountId: 'savings', count: 2 });
    expect(result[1]).toMatchObject({ toAccountId: 'vacation', count: 1 });
  });

  it('carries the amounts of the most recent transfer on the route', () => {
    const result = buildFrequentTransfers(
      [
        transfer({ date: new Date('2026-01-01'), fromAmount: 500, toAmount: 500 }),
        transfer({ date: new Date('2026-03-01'), fromAmount: 2500, toAmount: 2500 }),
        transfer({ date: new Date('2026-02-01'), fromAmount: 900, toAmount: 900 }),
      ],
      { eligibleAccountIds: ACCOUNTS },
    );

    expect(result[0]).toMatchObject({ count: 3, fromAmount: 2500, toAmount: 2500 });
  });

  it('treats a different currency pair as a different route', () => {
    const result = buildFrequentTransfers(
      [
        transfer(),
        transfer({ toCurrency: 'EUR', toAmount: 460, exchangeRate: 0.23 }),
      ],
      { eligibleAccountIds: ACCOUNTS },
    );

    expect(result).toHaveLength(2);
  });

  it('drops routes touching an account that no longer exists', () => {
    const result = buildFrequentTransfers(
      [transfer({ toAccountId: 'deleted-account' })],
      { eligibleAccountIds: ACCOUNTS },
    );

    expect(result).toEqual([]);
  });

  it('drops routes paying from an account the user only views', () => {
    const result = buildFrequentTransfers([transfer()], {
      eligibleAccountIds: ACCOUNTS,
      readOnlyAccountIds: ['personal'],
    });

    expect(result).toEqual([]);
  });

  it('keeps a route that merely receives into a view-only account', () => {
    const result = buildFrequentTransfers([transfer()], {
      eligibleAccountIds: ACCOUNTS,
      readOnlyAccountIds: ['savings'],
    });

    expect(result).toHaveLength(1);
  });

  it('ignores deleted transfers', () => {
    const result = buildFrequentTransfers([transfer({ isDeleted: true })], {
      eligibleAccountIds: ACCOUNTS,
    });

    expect(result).toEqual([]);
  });

  it('breaks count ties by recency', () => {
    const result = buildFrequentTransfers(
      [
        transfer({ toAccountId: 'savings', date: new Date('2026-01-01') }),
        transfer({ toAccountId: 'vacation', date: new Date('2026-05-01') }),
      ],
      { eligibleAccountIds: ACCOUNTS },
    );

    expect(result[0].toAccountId).toBe('vacation');
  });

  it('caps the list at the requested limit', () => {
    const result = buildFrequentTransfers(
      [
        transfer({ toAccountId: 'savings' }),
        transfer({ toAccountId: 'vacation' }),
        transfer({ fromAccountId: 'savings', toAccountId: 'vacation' }),
        transfer({ fromAccountId: 'vacation', toAccountId: 'personal' }),
      ],
      { eligibleAccountIds: ACCOUNTS, limit: 2 },
    );

    expect(result).toHaveLength(2);
  });
});
