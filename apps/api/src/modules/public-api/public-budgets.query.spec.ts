import { Prisma } from '@prisma/client';
import { PublicApiError } from './public-api-error';
import { getPublicBudget, listPublicBudgets, requirePublicBudgetId } from './public-budgets.query';

const D = (v: string) => new Prisma.Decimal(v);

function budgetRow(id: string) {
  return {
    id,
    name: 'n',
    amount: D('10'),
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: null,
    alertThreshold: 80,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    categoryAllocations: [],
  };
}
const progress = (id: string) => ({
  budget: budgetRow(id),
  periodStart: new Date(2026, 10, 1),
  periodEnd: new Date(2026, 10, 30),
  spent: 1,
  remaining: 9,
  percentageUsed: 10,
  projectedTotal: 5,
});

function make(found: unknown = { id: 'b-1' }) {
  const prisma = { budget: { findFirst: jest.fn(async () => found) } };
  const budgets = {
    findAll: jest.fn(async () => [budgetRow('b-1'), budgetRow('b-2')]),
    getAccountAnchorDay: jest.fn(async () => 15),
    getProgress: jest.fn(async (_a: string, id: string) => progress(id)),
  };
  return { prisma: prisma as any, budgets: budgets as any };
}

describe('public budgets query', () => {
  it('list: every budget with progress computed with the account anchor day', async () => {
    const { budgets } = make();
    const rows = await listPublicBudgets(budgets, 'acc-1');
    expect(rows.map((r) => r.id)).toEqual(['b-1', 'b-2']);
    expect(rows[0].progress).toEqual({
      periodStart: expect.any(Date),
      periodEnd: expect.any(Date),
      spent: 1,
      remaining: 9,
      percentageUsed: 10,
      projectedTotal: 5,
    });
    expect(budgets.getAccountAnchorDay).toHaveBeenCalledWith('acc-1');
    expect(budgets.getProgress).toHaveBeenCalledWith('acc-1', 'b-1', 15);
    expect(budgets.getProgress).toHaveBeenCalledWith('acc-1', 'b-2', 15);
  });

  it('detail: by SERVER id of this account only, progress with the anchor day', async () => {
    const { prisma, budgets } = make();
    const row = await getPublicBudget(prisma, budgets, 'acc-1', 'b-1');
    expect(row.id).toBe('b-1');
    expect(prisma.budget.findFirst).toHaveBeenCalledWith({
      where: { id: 'b-1', accountId: 'acc-1', isDeleted: false },
      select: { id: true },
    });
    expect(budgets.getProgress).toHaveBeenCalledWith('acc-1', 'b-1', 15);
  });

  it('a missing, deleted or foreign budget is 404 not_found', async () => {
    const { prisma } = make(null);
    await expect(requirePublicBudgetId(prisma, 'acc-1', 'x')).rejects.toMatchObject({
      status: 404,
    });
    await expect(requirePublicBudgetId(prisma, 'acc-1', 'x')).rejects.toBeInstanceOf(
      PublicApiError
    );
  });
});
