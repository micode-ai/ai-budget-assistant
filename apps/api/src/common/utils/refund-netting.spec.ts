import { NETTING_REFUND_WHERE, loadRefundsInRange, sumRefundsForExpenses, attributeRefund, sumRefunds, netOfRefunds, EXCLUDE_REFUND_INCOME } from './refund-netting';

describe('refund-netting', () => {
  it('attributes to the original category', () => {
    expect(attributeRefund({ amount: 12, refundOfExpense: { amount: 40, categoryId: 'c1' } })).toEqual([
      { categoryId: 'c1', categoryName: 'Uncategorized', amount: 12 },
    ]);
  });
  it('shares across live splits proportionally', () => {
    const parts = attributeRefund({
      amount: 10,
      refundOfExpense: { amount: 40, categorySplits: [{ categoryId: 'a', amount: 30 }, { categoryId: 'b', amount: 10 }] },
    });
    expect(parts.map((p) => [p.categoryId, p.amount])).toEqual([['a', 7.5], ['b', 2.5]]);
  });
  it('ignores a refund with no original or no amount', () => {
    expect(attributeRefund({ amount: 5 })).toEqual([]);
    expect(attributeRefund({ amount: 0, refundOfExpense: { amount: 1, categoryId: 'x' } })).toEqual([]);
  });
  it('sums only within a category set', () => {
    const refunds = [
      { amount: 10, refundOfExpense: { amount: 40, categoryId: 'a' } },
      { amount: 5, refundOfExpense: { amount: 20, categoryId: 'b' } },
    ];
    expect(sumRefunds(refunds)).toBe(15);
    expect(sumRefunds(refunds, new Set(['a']))).toBe(10);
  });
  it('never nets below zero and rounds to cents', () => {
    expect(netOfRefunds(10, 25)).toBe(0);
    expect(netOfRefunds(10.005, 0.001)).toBe(10);
  });
  it('predicate excludes linked incomes', () => {
    expect(EXCLUDE_REFUND_INCOME).toEqual({
      AND: [{ OR: [{ refundOfExpenseId: null }, { refundOfExpense: { isDeleted: true } }] }],
    });
  });
  it('netting predicate requires a live original (orphaned refund is income again)', async () => {
    expect(NETTING_REFUND_WHERE.refundOfExpense).toEqual({ isDeleted: false });
    const findMany = jest.fn().mockResolvedValue([]);
    await loadRefundsInRange({ income: { findMany } }, 'a1', { gte: new Date() });
    expect(findMany.mock.calls[0][0].where.refundOfExpense).toEqual({ isDeleted: false });
  });
  it('sumRefundsForExpenses filters by currency and live original', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { amount: 12 } });
    const total = await sumRefundsForExpenses({ income: { aggregate } }, 'a1', { merchant: 'x' }, { gte: new Date(), lte: new Date() }, 'PLN');
    expect(total).toBe(12);
    const where = aggregate.mock.calls[0][0].where;
    expect(where.currencyCode).toBe('PLN');
    expect(where.refundOfExpense).toEqual({ merchant: 'x', isDeleted: false });
  });
});
