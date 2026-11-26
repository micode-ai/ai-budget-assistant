import { RecentlyDeletedService } from './recently-deleted.service';

const DAY = 24 * 60 * 60 * 1000;

function build() {
  const prisma: any = {
    expense: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    income: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    accountTransfer: { findFirst: jest.fn() },
  };
  return { prisma, service: new RecentlyDeletedService(prisma) };
}

describe('RecentlyDeletedService', () => {
  it('restores an expense using the resolved server PK and bumps syncVersion', async () => {
    const { prisma, service } = build();
    prisma.expense.findFirst.mockResolvedValue({ id: 'pk1', updatedAt: new Date(), relatedDebtIncomeId: null });
    const r = await service.restore('acc', [{ entityType: 'expense', id: 'client-1' }]);
    expect(r.restored).toHaveLength(1);
    expect(prisma.expense.update).toHaveBeenCalledWith({
      where: { id: 'pk1' },
      data: { isDeleted: false, syncVersion: { increment: 1 } },
    });
    expect(prisma.expense.findFirst.mock.calls[0][0].where.accountId).toBe('acc');
  });

  it('skips rows older than 30 days and unknown rows', async () => {
    const { prisma, service } = build();
    prisma.income.findFirst.mockResolvedValueOnce({ id: 'i1', updatedAt: new Date(Date.now() - 31 * DAY), relatedDebtExpenseId: null });
    prisma.income.findFirst.mockResolvedValueOnce(null);
    const r = await service.restore('acc', [
      { entityType: 'income', id: 'i1' },
      { entityType: 'income', id: 'nope' },
    ]);
    expect(r.skipped.map(s => s.reason)).toEqual(['expired', 'not_found']);
    expect(prisma.income.update).not.toHaveBeenCalled();
  });

  it('refuses a repayment whose debt is still deleted', async () => {
    const { prisma, service } = build();
    prisma.expense.findFirst.mockResolvedValue({ id: 'e1', updatedAt: new Date(), relatedDebtIncomeId: 'd1' });
    prisma.income.findFirst.mockResolvedValue({ id: 'd1' });
    const r = await service.restore('acc', [{ entityType: 'expense', id: 'e1' }]);
    expect(r.skipped[0].reason).toBe('debt_deleted');
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('refuses an income whose transfer is still deleted', async () => {
    const { prisma, service } = build();
    prisma.income.findFirst.mockResolvedValue({ id: 'i1', updatedAt: new Date(), relatedDebtExpenseId: null });
    prisma.accountTransfer.findFirst.mockResolvedValue({ id: 't1' });
    const r = await service.restore('acc', [{ entityType: 'income', id: 'i1' }]);
    expect(r.skipped[0].reason).toBe('transfer_deleted');
    expect(prisma.accountTransfer.findFirst.mock.calls[0][0].where).toEqual({ linkedIncomeId: 'i1', isDeleted: true });
    expect(prisma.income.update).not.toHaveBeenCalled();
  });

  it('refuses an income repayment whose debt expense is still deleted', async () => {
    const { prisma, service } = build();
    prisma.income.findFirst.mockResolvedValue({ id: 'i1', updatedAt: new Date(), relatedDebtExpenseId: 'e9' });
    prisma.accountTransfer.findFirst.mockResolvedValue(null);
    prisma.expense.findFirst.mockResolvedValue({ id: 'e9' });
    const r = await service.restore('acc', [{ entityType: 'income', id: 'i1' }]);
    expect(r.skipped[0].reason).toBe('debt_deleted');
    expect(prisma.income.update).not.toHaveBeenCalled();
  });

  it('restores an income with no deleted transfer or debt', async () => {
    const { prisma, service } = build();
    prisma.income.findFirst.mockResolvedValue({ id: 'i1', updatedAt: new Date(), relatedDebtExpenseId: null });
    prisma.accountTransfer.findFirst.mockResolvedValue(null);
    const r = await service.restore('acc', [{ entityType: 'income', id: 'i1' }]);
    expect(r.restored).toHaveLength(1);
    expect(prisma.income.update).toHaveBeenCalled();
  });
});
