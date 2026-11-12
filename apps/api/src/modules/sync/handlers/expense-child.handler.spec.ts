import { Logger } from '@nestjs/common';
import { processExpenseChildChange } from './expense-child.handler';
import { SyncHandlerContext } from '../sync-types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makePrisma() {
  return {
    expense: {
      findFirst: jest.fn(async ({ where }: any) => {
        const key = where.OR?.[0]?.id;
        if (where.accountId !== 'acc-1') return null;
        return key === 'exp-local' || key === 'exp-pk' ? { id: 'exp-pk' } : null;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    child: {
      findFirst: jest.fn(async ({ where }: any) => {
        const key = where.OR?.[0]?.id;
        if (where.accountId !== 'acc-1') return null;
        return key === 'child-local' || key === 'child-pk' ? { id: 'child-pk' } : null;
      }),
    },
    expenseChild: {
      upsert: jest.fn().mockResolvedValue({ id: 'link-1', syncVersion: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeCtx(prisma: any): SyncHandlerContext {
  return { prisma, expensesService: {} as any, incomesService: {} as any, logger: new Logger('test') };
}

const change = (over: Record<string, any> = {}): any => ({
  entityType: 'expense_child',
  entityId: 'link-local',
  operation: 'create',
  clientVersion: 0,
  accountId: 'acc-1',
  payload: { expenseId: 'exp-local', childId: 'child-local', share: 0.5 },
  ...over,
});

describe('processExpenseChildChange', () => {
  it('expense_child resolves clientIds to server PKs', async () => {
    const prisma = makePrisma();
    const r = await processExpenseChildChange(makeCtx(prisma), 'acc-1', 'user-1', change());

    expect(r).toMatchObject({ entityId: 'link-local', status: 'success', serverId: 'link-1' });
    expect(prisma.expense.findFirst.mock.calls[0][0].where).toEqual({
      accountId: 'acc-1', OR: [{ id: 'exp-local' }, { clientId: 'exp-local' }],
    });
    expect(prisma.child.findFirst.mock.calls[0][0].where).toEqual({
      accountId: 'acc-1', OR: [{ id: 'child-local' }, { clientId: 'child-local' }],
    });
    expect(prisma.expenseChild.upsert).toHaveBeenCalledWith({
      where: { expenseId_childId: { expenseId: 'exp-pk', childId: 'child-pk' } },
      create: { expenseId: 'exp-pk', childId: 'child-pk', share: 0.5 },
      update: { share: 0.5, isDeleted: false, syncVersion: { increment: 1 } },
    });
    // Parent bumped so change feeds re-deliver it.
    expect(prisma.expense.updateMany).toHaveBeenCalledWith({ where: { id: 'exp-pk', accountId: 'acc-1' }, data: { updatedAt: expect.any(Date) } });
  });

  it('rejects a link whose expense or child belongs to another account', async () => {
    const prisma = makePrisma();
    const r = await processExpenseChildChange(makeCtx(prisma), 'acc-2', 'user-1', change());
    expect(r).toMatchObject({ status: 'error' });
    expect(prisma.expenseChild.upsert).not.toHaveBeenCalled();

    const r2 = await processExpenseChildChange(makeCtx(prisma), 'acc-1', 'user-1', change({ payload: { expenseId: 'exp-local', childId: 'ghost', share: 1 } }));
    expect(r2).toMatchObject({ status: 'error' });
    expect(prisma.expenseChild.upsert).not.toHaveBeenCalled();
  });

  it('delete soft-deletes the link keyed by the resolved (expense, child) pair', async () => {
    const prisma = makePrisma();
    const r = await processExpenseChildChange(makeCtx(prisma), 'acc-1', 'user-1', change({ operation: 'delete' }));
    expect(r).toMatchObject({ status: 'success' });
    expect(prisma.expenseChild.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'exp-pk', childId: 'child-pk', isDeleted: false },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
  });

  it('a delete for a pair that no longer resolves is a no-op success (already gone)', async () => {
    const prisma = makePrisma();
    const r = await processExpenseChildChange(makeCtx(prisma), 'acc-1', 'user-1', change({ operation: 'delete', payload: { expenseId: 'gone', childId: 'child-local', share: 1 } }));
    expect(r).toMatchObject({ status: 'success' });
    expect(prisma.expenseChild.updateMany).not.toHaveBeenCalled();
  });
});
