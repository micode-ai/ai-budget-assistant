import { Test, TestingModule } from '@nestjs/testing';
import { BudgetAlertService } from './budget-alert.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockPrisma = {
  budget: { findMany: jest.fn() },
  expense: { aggregate: jest.fn(), groupBy: jest.fn() },
  budgetAlert: {
    findFirst: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockNotifications = {
  sendToUser: jest.fn(),
};

// A budget with one category allocation of 100.00; overall amount 200.
// At 0% overall spend the overall loop never calls findFirst.
const makeBudget = (overrides: any = {}) => ({
  id: 'budget-1',
  name: 'Monthly',
  userId: 'user-1',
  amount: 200,
  currencyCode: 'PLN',
  period: 'monthly',
  startDate: new Date('2026-07-01'),
  isActive: true,
  isDeleted: false,
  categoryAllocations: [
    {
      categoryId: 'cat-1',
      amount: 100,
      isDeleted: false,
      category: { id: 'cat-1', name: 'Food' },
    },
  ],
  ...overrides,
});

describe('BudgetAlertService — category thresholds', () => {
  let service: BudgetAlertService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Overall budget spend = 0 → overall loop never reaches a threshold → no findFirst calls for overall
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.expense.groupBy.mockResolvedValue([]);
    mockPrisma.budgetAlert.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.budgetAlert.update.mockResolvedValue({});
    mockNotifications.sendToUser.mockResolvedValue(true);

    // Key helper: findFirst is called twice per threshold that fires:
    //   1st call (dedup check): no orderBy → return null (no existing alert)
    //   2nd call (post-insert):  has orderBy  → return the inserted alert
    // This implementation avoids fragile call-order mocks.
    mockPrisma.budgetAlert.findFirst.mockImplementation(async (args: any) => {
      if (args?.orderBy) {
        return { id: 'alert-id', notificationSent: false };
      }
      return null; // dedup: no existing alert
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetAlertService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<BudgetAlertService>(BudgetAlertService);
  });

  it('fires no category alert when category spend is 0%', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([]); // 0 spent in all categories

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId,
    );
    expect(categoryCalls).toHaveLength(0);
  });

  it('fires only the 50% alert when category is at 55%', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { categoryId: 'cat-1', _sum: { amount: 55 } },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === 'cat-1',
    );
    expect(categoryCalls).toHaveLength(1);
    expect(categoryCalls[0][3].thresholdPercentage).toBe(50);
  });

  it('fires 50% and 80% alerts when category is at 85%', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { categoryId: 'cat-1', _sum: { amount: 85 } },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === 'cat-1',
    );
    expect(categoryCalls).toHaveLength(2);
    const thresholds = categoryCalls.map((c: any[]) => c[3].thresholdPercentage).sort((a, b) => a - b);
    expect(thresholds).toEqual([50, 80]);
  });

  it('fires all three alerts (50/80/100) when category is at 105%', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { categoryId: 'cat-1', _sum: { amount: 105 } },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === 'cat-1',
    );
    expect(categoryCalls).toHaveLength(3);
    const thresholds = categoryCalls.map((c: any[]) => c[3].thresholdPercentage).sort((a, b) => a - b);
    expect(thresholds).toEqual([50, 80, 100]);
  });

  it('does not fire again on second run when alert already exists (dedup)', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { categoryId: 'cat-1', _sum: { amount: 60 } },
    ]);
    // Both dedup and post-insert findFirst return existing alert
    mockPrisma.budgetAlert.findFirst.mockResolvedValue({
      id: 'existing',
      notificationSent: true,
    });

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId,
    );
    expect(categoryCalls).toHaveLength(0);
  });

  it('skips groupBy entirely when budget has no categoryAllocations', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([
      makeBudget({ categoryAllocations: [] }),
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    expect(mockPrisma.expense.groupBy).not.toHaveBeenCalled();
  });

  it('includes categoryName and categoryId in the notification payload', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { categoryId: 'cat-1', _sum: { amount: 55 } },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === 'cat-1',
    );
    expect(categoryCalls[0][3].categoryName).toBe('Food');
    expect(categoryCalls[0][3].thresholdPercentage).toBe(50);
  });

  it('overall spend aggregate excludes split receivables but still counts a standalone debt', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.expense.groupBy.mockResolvedValue([]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const where = (mockPrisma.expense.aggregate as jest.Mock).mock.calls[0][0].where;
    // The marker the split feature sets — must be filtered out.
    expect(where.isSplitReceivable).toBe(false);
    // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
    // filtering on it would rewrite the numbers of every user tracking debts.
    expect(where.isDebt).toBeUndefined();
  });

  it('category spend groupBy excludes split receivables but still counts a standalone debt', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { categoryId: 'cat-1', _sum: { amount: 0 } },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const where = (mockPrisma.expense.groupBy as jest.Mock).mock.calls[0][0].where;
    // The marker the split feature sets — must be filtered out.
    expect(where.isSplitReceivable).toBe(false);
    // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
    // filtering on it would rewrite the numbers of every user tracking debts.
    expect(where.isDebt).toBeUndefined();
  });
});
