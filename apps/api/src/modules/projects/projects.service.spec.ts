import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

function makePrisma(overrides: any = {}) {
  return {
    project: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      update: jest.fn(),
      ...overrides.project,
    },
    expense: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.expense,
    },
    income: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.income,
    },
    projectExpense: {
      upsert: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      ...overrides.projectExpense,
    },
    projectIncome: {
      upsert: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      ...overrides.projectIncome,
    },
    ...overrides.rest,
  };
}

function makeEmbeddingService() {
  return { embedAndStore: jest.fn().mockResolvedValue(undefined) };
}

function makeService(prisma: any) {
  return new ProjectsService(prisma, makeEmbeddingService() as any);
}

// Regression for the ABA-374 bug class: the mobile client addresses every
// offline-first row (projects, expenses, incomes) by its local clientId,
// which differs from the server PK until a full sync round-trip backfills
// it. Every lookup below must resolve OR:[{id},{clientId}] before the id is
// reused as a foreign key, or a device-created row 404s/no-ops from the web
// app (native devices never notice — they have a local SQLite copy).
describe('ProjectsService — clientId resolution (ABA-374 bug class)', () => {
  it('findOne resolves a project addressed by its local clientId', async () => {
    const project = { id: 'server-project-1', projectExpenses: [], projectIncomes: [] };
    const prisma = makePrisma({ project: { findFirst: jest.fn().mockResolvedValue(project) } });

    const result = await makeService(prisma).findOne('acc-1', 'local-project-1');

    expect(result).toBe(project);
    const where = prisma.project.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ id: 'local-project-1' }, { clientId: 'local-project-1' }]);
  });

  it('findOne throws NotFoundException when neither id nor clientId matches', async () => {
    const prisma = makePrisma();
    await expect(makeService(prisma).findOne('acc-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('update resolves the project by clientId and writes to the resolved server PK', async () => {
    const prisma = makePrisma({
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'server-project-2', name: 'Old' }),
        update: jest.fn().mockResolvedValue({ id: 'server-project-2', name: 'New' }),
      },
    });

    await makeService(prisma).update('acc-1', 'local-project-2', { name: 'New' } as any);

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'server-project-2' } }),
    );
  });

  it('remove resolves the project by clientId and soft-deletes the resolved server PK', async () => {
    const prisma = makePrisma({
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'server-project-3' }),
        update: jest.fn().mockResolvedValue({ id: 'server-project-3', isDeleted: true }),
      },
    });

    await makeService(prisma).remove('acc-1', 'local-project-3');

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'server-project-3' },
      data: { isDeleted: true },
    });
  });

  it('addExpense resolves BOTH the project and the expense by clientId before joining them', async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'server-project-4' }) },
      expense: { findFirst: jest.fn().mockResolvedValue({ id: 'server-expense-1' }) },
    });

    await makeService(prisma).addExpense('acc-1', 'local-project-4', 'local-expense-1');

    expect(prisma.projectExpense.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_expenseId: { projectId: 'server-project-4', expenseId: 'server-expense-1' } },
        create: { projectId: 'server-project-4', expenseId: 'server-expense-1' },
      }),
    );
  });

  it('addExpense throws NotFoundException when the expense clientId does not resolve', async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'server-project-5' }) },
      expense: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      makeService(prisma).addExpense('acc-1', 'local-project-5', 'missing-expense'),
    ).rejects.toThrow('Expense not found');
  });

  it('removeExpense resolves BOTH ids by clientId before looking up and soft-deleting the join row', async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'server-project-6' }) },
      expense: { findFirst: jest.fn().mockResolvedValue({ id: 'server-expense-2' }) },
      projectExpense: { findUnique: jest.fn().mockResolvedValue({ projectId: 'server-project-6', expenseId: 'server-expense-2' }) },
    });

    await makeService(prisma).removeExpense('acc-1', 'local-project-6', 'local-expense-2');

    expect(prisma.projectExpense.update).toHaveBeenCalledWith({
      where: { projectId_expenseId: { projectId: 'server-project-6', expenseId: 'server-expense-2' } },
      data: { isDeleted: true },
    });
  });

  it('addIncome resolves BOTH the project and the income by clientId before joining them', async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'server-project-7' }) },
      income: { findFirst: jest.fn().mockResolvedValue({ id: 'server-income-1' }) },
    });

    await makeService(prisma).addIncome('acc-1', 'local-project-7', 'local-income-1');

    expect(prisma.projectIncome.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_incomeId: { projectId: 'server-project-7', incomeId: 'server-income-1' } },
        create: { projectId: 'server-project-7', incomeId: 'server-income-1' },
      }),
    );
  });

  it('removeIncome resolves BOTH ids by clientId before looking up and soft-deleting the join row', async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'server-project-8' }) },
      income: { findFirst: jest.fn().mockResolvedValue({ id: 'server-income-2' }) },
      projectIncome: { findUnique: jest.fn().mockResolvedValue({ projectId: 'server-project-8', incomeId: 'server-income-2' }) },
    });

    await makeService(prisma).removeIncome('acc-1', 'local-project-8', 'local-income-2');

    expect(prisma.projectIncome.update).toHaveBeenCalledWith({
      where: { projectId_incomeId: { projectId: 'server-project-8', incomeId: 'server-income-2' } },
      data: { isDeleted: true },
    });
  });

  it('getAnalytics resolves the project by clientId', async () => {
    const project = { id: 'server-project-9', projectExpenses: [], projectIncomes: [], budget: null };
    const prisma = makePrisma({ project: { findFirst: jest.fn().mockResolvedValue(project) } });

    const result = await makeService(prisma).getAnalytics('acc-1', 'local-project-9');

    expect(result.totalExpenses).toBe(0);
    const where = prisma.project.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ id: 'local-project-9' }, { clientId: 'local-project-9' }]);
  });
});
