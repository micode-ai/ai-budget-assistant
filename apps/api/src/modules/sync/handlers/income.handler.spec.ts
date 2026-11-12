import { Logger } from '@nestjs/common';
import { processIncomeChange } from './income.handler';
import { IncomesService } from '../../incomes/incomes.service';
import { SyncHandlerContext } from '../sync-types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeCtx() {
  const income = {
    upsert: jest.fn().mockResolvedValue({ id: 'inc-pk', syncVersion: 0 }),
    findUnique: jest.fn().mockResolvedValue({ id: 'inc-pk', syncVersion: 0, user: { name: 'A' } }),
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue({ id: 'inc-pk', syncVersion: 1, isDeleted: false, user: { name: 'A' } }),
  };
  const child = {
    findFirst: jest.fn(async ({ where }: any) =>
      where.accountId === 'acc-1' && where.OR?.[0]?.id === 'child-local' ? { id: 'child-pk' } : null),
  };
  const prisma: any = {
    income,
    child,
    category: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    project: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const cache: any = { del: jest.fn().mockResolvedValue(undefined) };
  const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
  const incomesService = new IncomesService(prisma, cache, gamification);
  const ctx: SyncHandlerContext = { prisma, expensesService: {} as any, incomesService, logger: new Logger('test') };
  return { ctx, prisma };
}

const change = (over: Record<string, any> = {}): any => ({
  entityType: 'income',
  entityId: 'inc-local',
  operation: 'create',
  clientVersion: 0,
  accountId: 'acc-1',
  payload: { amount: 800, currencyCode: 'PLN', date: '2026-11-01', description: '800+', childBenefitChildId: 'child-local' },
  ...over,
});

describe('processIncomeChange — childBenefitChildId', () => {
  it('income childBenefitChildId persists (resolved to the server PK) on create', async () => {
    const { ctx, prisma } = makeCtx();
    prisma.income.findUnique.mockResolvedValueOnce(null); // getByClientId → not there yet
    const r = await processIncomeChange(ctx, 'acc-1', 'user-1', change());
    expect(r.status).toBe('success');
    const args = prisma.income.upsert.mock.calls[0][0];
    expect(args.create.childBenefitChildId).toBe('child-pk');
    expect(args.update.childBenefitChildId).toBe('child-pk');
  });

  it('on update: a client id resolves, null clears, absent leaves', async () => {
    const { ctx, prisma } = makeCtx();
    prisma.income.findUnique.mockResolvedValue({ id: 'inc-pk', syncVersion: 1, user: { name: 'A' } });

    await processIncomeChange(ctx, 'acc-1', 'user-1', change({ operation: 'update', clientVersion: 1 }));
    expect(prisma.income.update.mock.calls[0][0].data.childBenefitChildId).toBe('child-pk');

    await processIncomeChange(ctx, 'acc-1', 'user-1', change({ operation: 'update', clientVersion: 1, payload: { amount: 800, childBenefitChildId: null } }));
    expect(prisma.income.update.mock.calls[1][0].data.childBenefitChildId).toBeNull();

    await processIncomeChange(ctx, 'acc-1', 'user-1', change({ operation: 'update', clientVersion: 1, payload: { amount: 800 } }));
    expect(prisma.income.update.mock.calls[2][0].data.childBenefitChildId).toBeUndefined();
  });

  it("never links another account's child", async () => {
    const { ctx, prisma } = makeCtx();
    prisma.income.findUnique.mockResolvedValueOnce(null);
    await processIncomeChange(ctx, 'acc-1', 'user-1', change({ payload: { amount: 800, currencyCode: 'PLN', date: '2026-11-01', childBenefitChildId: 'foreign' } }));
    expect(prisma.income.upsert.mock.calls[0][0].create.childBenefitChildId).toBeNull();
  });
});
