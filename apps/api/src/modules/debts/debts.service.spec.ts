import { DebtsService } from './debts.service';

function makeService(overrides: {
  lentDebts?: any[];
  borrowedDebts?: any[];
  lentRepayments?: any[];
  borrowedRepayments?: any[];
} = {}) {
  const lentDebts = overrides.lentDebts ?? [];
  const borrowedDebts = overrides.borrowedDebts ?? [];

  const expense: any = {
    findMany: jest.fn().mockImplementation(({ where }: any) => {
      if (where.isDebt) return Promise.resolve(lentDebts);
      if (where.isDebtRepayment) return Promise.resolve(overrides.borrowedRepayments ?? []);
      return Promise.resolve([]);
    }),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'exp-created', ...data })),
  };
  const income: any = {
    findMany: jest.fn().mockImplementation(({ where }: any) => {
      if (where.isDebt) return Promise.resolve(borrowedDebts);
      if (where.isDebtRepayment) return Promise.resolve(overrides.lentRepayments ?? []);
      return Promise.resolve([]);
    }),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'inc-created', ...data })),
  };

  const prisma: any = { expense, income };
  const service = new DebtsService(prisma);
  return { service, prisma, expense, income };
}

describe('DebtsService.getDebtSummary', () => {
  it('marks a lent debt as paid once repayments cover the full amount', async () => {
    const { service } = makeService({
      lentDebts: [
        {
          id: 'd-1',
          amount: 100,
          currencyCode: 'USD',
          debtContactName: 'Bob',
          debtDueDate: null,
          date: new Date('2026-06-01'),
          description: 'Lunch money',
        },
      ],
      lentRepayments: [{ id: 'r-1', amount: 100, date: new Date('2026-06-10'), description: 'paid back' }],
    });

    const summary = await service.getDebtSummary('acc-1');

    expect(summary.lent).toHaveLength(1);
    expect(summary.lent[0]).toEqual(
      expect.objectContaining({ type: 'lent', status: 'paid', remainingAmount: 0, totalRepaid: 100 }),
    );
    expect(summary.totals.totalLent).toBe(100);
    expect(summary.totals.totalLentRemaining).toBe(0);
  });

  it('marks a lent debt overdue when the due date has passed and it is not fully repaid', async () => {
    const { service } = makeService({
      lentDebts: [
        {
          id: 'd-2',
          amount: 200,
          currencyCode: 'USD',
          debtContactName: 'Carol',
          debtDueDate: new Date('2020-01-01'),
          date: new Date('2019-12-01'),
          description: 'Old loan',
        },
      ],
      lentRepayments: [],
    });

    const summary = await service.getDebtSummary('acc-1');

    expect(summary.lent[0]).toEqual(expect.objectContaining({ status: 'overdue', remainingAmount: 200 }));
  });

  it('marks a lent debt active when not due yet and only partially repaid', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const { service } = makeService({
      lentDebts: [
        {
          id: 'd-3',
          amount: 100,
          currencyCode: 'USD',
          debtContactName: 'Dan',
          debtDueDate: future,
          date: new Date('2026-06-01'),
          description: null,
        },
      ],
      lentRepayments: [{ id: 'r-2', amount: 40, date: new Date('2026-06-15'), description: null }],
    });

    const summary = await service.getDebtSummary('acc-1');

    expect(summary.lent[0]).toEqual(expect.objectContaining({ status: 'active', remainingAmount: 60, totalRepaid: 40 }));
  });

  it('computes borrowed debts symmetrically from incomes+expense repayments', async () => {
    const { service } = makeService({
      borrowedDebts: [
        {
          id: 'b-1',
          amount: 50,
          currencyCode: 'USD',
          debtContactName: 'Eve',
          debtDueDate: null,
          date: new Date('2026-06-01'),
          description: 'Borrowed cash',
        },
      ],
      borrowedRepayments: [{ id: 'r-3', amount: 20, date: new Date('2026-06-05'), description: null }],
    });

    const summary = await service.getDebtSummary('acc-1');

    expect(summary.borrowed).toHaveLength(1);
    expect(summary.borrowed[0]).toEqual(
      expect.objectContaining({ type: 'borrowed', remainingAmount: 30, totalRepaid: 20, status: 'active' }),
    );
    expect(summary.totals.totalBorrowed).toBe(50);
    expect(summary.totals.totalBorrowedRemaining).toBe(30);
  });

  it('falls back to USD when there are no debts of either kind', async () => {
    const { service } = makeService();

    const summary = await service.getDebtSummary('acc-1');

    expect(summary.lent).toEqual([]);
    expect(summary.borrowed).toEqual([]);
    expect(summary.totals).toEqual({
      totalLent: 0,
      totalBorrowed: 0,
      totalLentRemaining: 0,
      totalBorrowedRemaining: 0,
      currencyCode: 'USD',
    });
  });
});

describe('DebtsService.recordRepayment', () => {
  it('creates an income repayment linked via relatedDebtExpenseId when the debt is a lent expense', async () => {
    const { service, expense, income } = makeService();
    expense.findFirst.mockResolvedValue({
      id: 'debt-1',
      currencyCode: 'USD',
      debtContactName: 'Bob',
    });

    const result = await service.recordRepayment('acc-1', 'user-1', 'debt-1', 40, '2026-07-01');

    expect(result.type).toBe('lent');
    expect(income.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDebtRepayment: true,
          relatedDebtExpenseId: 'debt-1',
          amount: 40,
          currencyCode: 'USD',
        }),
      }),
    );
  });

  it('creates an expense repayment linked via relatedDebtIncomeId when the debt is a borrowed income', async () => {
    const { service, expense, income } = makeService();
    expense.findFirst.mockResolvedValue(null);
    income.findFirst.mockResolvedValue({
      id: 'debt-2',
      currencyCode: 'EUR',
      debtContactName: 'Alice',
    });

    const result = await service.recordRepayment('acc-1', 'user-1', 'debt-2', 25);

    expect(result.type).toBe('borrowed');
    expect(expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDebtRepayment: true,
          relatedDebtIncomeId: 'debt-2',
          amount: 25,
          currencyCode: 'EUR',
        }),
      }),
    );
  });

  it('throws when the debt id matches neither a lent expense nor a borrowed income', async () => {
    const { service } = makeService();

    await expect(service.recordRepayment('acc-1', 'user-1', 'missing-debt', 10)).rejects.toThrow(
      'Debt with id "missing-debt" not found',
    );
  });
});

describe('DebtsService.createDebt', () => {
  it('creates a lent debt as an Expense with isDebt=true', async () => {
    const { service, expense } = makeService();

    const result = await service.createDebt('acc-1', 'user-1', {
      contactName: 'Frank',
      amount: 75,
      currencyCode: 'USD',
      direction: 'lent',
      dueDate: '2026-08-01',
    });

    expect(result.type).toBe('lent');
    expect(expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDebt: true, debtContactName: 'Frank', amount: 75 }),
      }),
    );
  });

  it('creates a borrowed debt as an Income with isDebt=true', async () => {
    const { service, income } = makeService();

    const result = await service.createDebt('acc-1', 'user-1', {
      contactName: 'Grace',
      amount: 60,
      currencyCode: 'EUR',
      direction: 'borrowed',
    });

    expect(result.type).toBe('borrowed');
    expect(income.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDebt: true, debtContactName: 'Grace', amount: 60 }),
      }),
    );
  });

  it('truncates an overlong contact name to 100 chars', async () => {
    const { service, expense } = makeService();
    const longName = 'X'.repeat(150);

    await service.createDebt('acc-1', 'user-1', {
      contactName: longName,
      amount: 10,
      currencyCode: 'USD',
      direction: 'lent',
    });

    const data = expense.create.mock.calls[0][0].data;
    expect(data.debtContactName).toHaveLength(100);
  });
});
