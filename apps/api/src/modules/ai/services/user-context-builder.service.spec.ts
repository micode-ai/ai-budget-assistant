import { UserContextBuilder } from './user-context-builder.service';
import { financialMonth } from '../../../common/utils/financial-month';

function makeBuilder(monthAnchorDay: number | null) {
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ monthAnchorDay }) },
    expense: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    income: { findFirst: jest.fn().mockResolvedValue(null) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    project: { findMany: jest.fn().mockResolvedValue([]) },
    savingsGoal: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
  const categories: any = { findAll: jest.fn().mockResolvedValue([]) };
  const debts: any = { getDebtSummary: jest.fn().mockResolvedValue({ lent: [], borrowed: [] }) };
  return { builder: new UserContextBuilder(prisma, cache, categories, debts), prisma };
}

describe('UserContextBuilder — this month (ABA-792)', () => {
  it('counts the calendar month for an account without an anchor day', async () => {
    const { builder, prisma } = makeBuilder(null);
    const ctx = await builder.build('u1', 'a1');
    const gte = prisma.expense.findMany.mock.calls[0][0].where.date.gte as Date;
    expect(gte).toEqual(financialMonth(new Date(), null).start);
    expect(gte.getDate()).toBe(1);
    expect(ctx.monthStart).toBeUndefined();
  });

  it("counts the account's financial month and says when it began", async () => {
    const { builder, prisma } = makeBuilder(10);
    const ctx = await builder.build('u1', 'a1');
    const start = financialMonth(new Date(), 10).start;
    expect(prisma.expense.findMany.mock.calls[0][0].where.date.gte).toEqual(start);
    expect(ctx.monthStart).toBe(
      `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    );
  });
});
