import { computeBalances, simplifyDebts } from './settle-up-calculator';

describe('computeBalances', () => {
  it('nets a single expense paid by one person and split equally among three', () => {
    const balances = computeBalances([
      {
        expenseId: 'e1',
        paidByUserId: 'alice',
        amountInAccountCurrency: 90,
        shares: [
          { userId: 'alice', shareAmount: 30 },
          { userId: 'bob', shareAmount: 30 },
          { userId: 'carol', shareAmount: 30 },
        ],
      },
    ]);
    expect(balances.find((b) => b.userId === 'alice')?.netAmount).toBe(60);
    expect(balances.find((b) => b.userId === 'bob')?.netAmount).toBe(-30);
    expect(balances.find((b) => b.userId === 'carol')?.netAmount).toBe(-30);
  });

  it('nets multiple expenses across different payers', () => {
    const balances = computeBalances([
      {
        expenseId: 'e1',
        paidByUserId: 'alice',
        amountInAccountCurrency: 60,
        shares: [{ userId: 'alice', shareAmount: 30 }, { userId: 'bob', shareAmount: 30 }],
      },
      {
        expenseId: 'e2',
        paidByUserId: 'bob',
        amountInAccountCurrency: 20,
        shares: [{ userId: 'alice', shareAmount: 10 }, { userId: 'bob', shareAmount: 10 }],
      },
    ]);
    expect(balances.find((b) => b.userId === 'alice')?.netAmount).toBe(20);
    expect(balances.find((b) => b.userId === 'bob')?.netAmount).toBe(-20);
  });
});

describe('simplifyDebts', () => {
  it('produces a single transfer for a simple two-person debt', () => {
    const transfers = simplifyDebts([
      { userId: 'alice', netAmount: 60 },
      { userId: 'bob', netAmount: -60 },
    ]);
    expect(transfers).toEqual([{ fromUserId: 'bob', toUserId: 'alice', amount: 60 }]);
  });

  it('minimizes transfers for a 3-person cycle', () => {
    const transfers = simplifyDebts([
      { userId: 'alice', netAmount: 50 },
      { userId: 'bob', netAmount: 10 },
      { userId: 'carol', netAmount: -60 },
    ]);
    expect(transfers).toHaveLength(2);
    expect(transfers.reduce((sum, t) => sum + t.amount, 0)).toBe(60);
    expect(transfers.every((t) => t.fromUserId === 'carol')).toBe(true);
  });

  it('produces no transfers when everyone is already settled', () => {
    expect(simplifyDebts([{ userId: 'alice', netAmount: 0 }])).toEqual([]);
  });
});
