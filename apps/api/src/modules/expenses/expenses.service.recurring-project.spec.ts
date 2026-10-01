import { ExpensesService } from './expenses.service';
import { ExpenseRecurringCron } from './expense-recurring.cron';

function makeFullRow(over: any = {}) {
  return {
    id: 'e-1',
    accountId: 'acc-1',
    recurringId: 'rec-1',
    isRecurring: true,
    amount: 10,
    category: null,
    items: [],
    expenseTags: [],
    categorySplits: [],
    projectExpenses: [],
    user: { name: 'Alice' },
    ...over,
  };
}

function makeSvc(prisma: any, cache?: any) {
  const cacheService: any = cache ?? { delByPrefix: jest.fn(), del: jest.fn().mockResolvedValue(undefined) };
  return new ExpensesService(
    prisma,
    {} as any,
    cacheService,
    { dismissForExpense: jest.fn().mockResolvedValue(undefined) } as any,
    { upsertRule: jest.fn().mockResolvedValue(undefined) } as any,
    { expireForExpense: jest.fn().mockResolvedValue(undefined) } as any,
    { onExpenseCreated: jest.fn().mockResolvedValue(undefined) } as any,
  );
}

describe('stopRecurring stops the whole series', () => {
  it('flags every non-deleted row sharing the recurringId in the account, using the resolved PK', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      expense: {
        findFirst: jest.fn().mockResolvedValue(makeFullRow({ id: 'srv-1', clientId: 'local-1' })),
        update,
        updateMany,
      },
    };

    const res = await makeSvc(prisma).stopRecurring('acc-1', 'local-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', recurringId: 'rec-1', isDeleted: false },
      data: { isRecurring: false, syncVersion: { increment: 1 } },
    });
    expect(update).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'srv-1', isRecurring: false });
  });

  it('flags only the pressed row when it has no recurringId', async () => {
    const updateMany = jest.fn();
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      expense: { findFirst: jest.fn().mockResolvedValue(makeFullRow({ recurringId: null })), update, updateMany },
    };
    await makeSvc(prisma).stopRecurring('acc-1', 'e-1');

    expect(updateMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'e-1' },
      data: { isRecurring: false, syncVersion: { increment: 1 } },
    });
  });

  it('leaves the cron nothing to pick for a stopped series', async () => {
    const rows: any[] = [
      { id: 'a', accountId: 'acc-1', recurringId: 'rec-1', isRecurring: true, isDeleted: false, recurringPeriod: 'monthly', date: new Date('2020-01-01') },
      { id: 'b', accountId: 'acc-1', recurringId: 'rec-1', isRecurring: true, isDeleted: false, recurringPeriod: 'monthly', date: new Date('2020-02-01') },
    ];
    const matches = (r: any, w: any) =>
      (w.accountId === undefined || r.accountId === w.accountId) &&
      (typeof w.recurringId !== 'string' || r.recurringId === w.recurringId) &&
      (w.isRecurring === undefined || r.isRecurring === w.isRecurring) &&
      (w.isDeleted === undefined || r.isDeleted === w.isDeleted);
    const prisma: any = {
      expense: {
        findFirst: jest.fn().mockResolvedValue(makeFullRow({ id: 'b' })),
        updateMany: jest.fn(async ({ where, data }: any) => {
          rows.filter((r) => matches(r, where)).forEach((r) => (r.isRecurring = data.isRecurring));
          return { count: 2 };
        }),
        findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
        create: jest.fn(),
      },
    };
    await makeSvc(prisma).stopRecurring('acc-1', 'b');

    const cron = new ExpenseRecurringCron(prisma, { sendToUser: jest.fn() } as any);
    await cron.handleRecurringExpenses();
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });
});

describe('update() project link resolution', () => {
  function makeUpdateSvc(project: any) {
    const projectFindFirst = jest.fn().mockResolvedValue(project);
    const projectExpense = {
      updateMany: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const full = makeFullRow();
    const tx: any = {
      expense: { update: jest.fn().mockResolvedValue(full), findUnique: jest.fn().mockResolvedValue(full) },
      project: { findFirst: projectFindFirst, findUnique: jest.fn().mockResolvedValue(null) },
      projectExpense,
    };
    const prisma: any = {
      expense: { findFirst: jest.fn().mockResolvedValue(full) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    return { service: makeSvc(prisma), projectExpense, projectFindFirst };
  }

  it('resolves the project by clientId, scoped to the account, and links the resolved PK', async () => {
    const { service, projectExpense, projectFindFirst } = makeUpdateSvc({ id: 'srv-p' });
    await service.update('acc-1', 'e-1', { projectId: 'phone-p' } as any);

    expect(projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-1', isDeleted: false, OR: [{ id: 'phone-p' }, { clientId: 'phone-p' }] },
      }),
    );
    expect(projectExpense.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { projectId: 'srv-p', expenseId: 'e-1' } }),
    );
  });

  it('keeps the existing link when the project is unknown', async () => {
    const { service, projectExpense } = makeUpdateSvc(null);
    await service.update('acc-1', 'e-1', { projectId: 'nope' } as any);

    expect(projectExpense.updateMany).not.toHaveBeenCalled();
    expect(projectExpense.upsert).not.toHaveBeenCalled();
  });

  it('explicit null still clears the link', async () => {
    const { service, projectExpense } = makeUpdateSvc(null);
    await service.update('acc-1', 'e-1', { projectId: null } as any);

    expect(projectExpense.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'e-1', isDeleted: false },
      data: { isDeleted: true },
    });
    expect(projectExpense.upsert).not.toHaveBeenCalled();
  });
});

describe('fire-and-forget failures are logged, not swallowed', () => {
  it('stopRecurring and remove log a rejected cache invalidation', async () => {
    const cache: any = {
      delByPrefix: jest.fn().mockRejectedValue(new Error('redis down')),
      del: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const prisma: any = {
      expense: {
        findFirst: jest.fn().mockResolvedValue(makeFullRow({ recurringId: null })),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = makeSvc(prisma, cache);
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    await service.stopRecurring('acc-1', 'e-1');
    await service.remove('acc-1', 'e-1');
    await new Promise((r) => setImmediate(r));

    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
