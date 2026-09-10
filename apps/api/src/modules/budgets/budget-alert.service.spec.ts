import { Test, TestingModule } from '@nestjs/testing';
import { BudgetAlertService } from './budget-alert.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockPrisma = {
  budget: { findMany: jest.fn() },
  expense: { aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
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
    mockPrisma.expense.findMany.mockResolvedValue([]);
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
    mockPrisma.expense.findMany.mockResolvedValue([]); // 0 spent in all categories

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId,
    );
    expect(categoryCalls).toHaveLength(0);
  });

  it('fires only the 50% alert when category is at 55%', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 55, categoryId: 'cat-1', categorySplits: [] },
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
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 85, categoryId: 'cat-1', categorySplits: [] },
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
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 105, categoryId: 'cat-1', categorySplits: [] },
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
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 60, categoryId: 'cat-1', categorySplits: [] },
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

  it('keeps the cheap aggregate — never findMany — when budget has no categoryAllocations', async () => {
    // groupBy is gone entirely (replaced by attribution-aware findMany), and
    // a budget with no allocations is not category-scoped at all, so it must
    // keep reading the plain aggregate rather than paying for findMany rows.
    mockPrisma.budget.findMany.mockResolvedValue([
      makeBudget({ categoryAllocations: [] }),
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    expect(mockPrisma.expense.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.expense.aggregate).toHaveBeenCalled();
  });

  it('includes categoryName and categoryId in the notification payload', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 55, categoryId: 'cat-1', categorySplits: [] },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === 'cat-1',
    );
    expect(categoryCalls[0][3].categoryName).toBe('Food');
    expect(categoryCalls[0][3].thresholdPercentage).toBe(50);
  });

  it('overall spend excludes split receivables but still counts a standalone debt', async () => {
    // makeBudget() carries one category allocation, so the overall check now
    // goes through findMany (categoryOrSplitFilter), not the plain aggregate
    // — aggregate is reserved for a budget with no allocations at all (see
    // "keeps the cheap aggregate — never findMany" above). Same reasoning as
    // budgets.service.ts's getProgress.
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    // findMany call 0 is the overall spend check (it runs before
    // checkCategoryThresholds's own findMany call).
    const where = (mockPrisma.expense.findMany as jest.Mock).mock.calls[0][0].where;
    // The marker the split feature sets — must be filtered out.
    expect(where.isSplitReceivable).toBe(false);
    // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
    // filtering on it would rewrite the numbers of every user tracking debts.
    expect(where.isDebt).toBeUndefined();
  });

  it('category spend excludes split receivables but still counts a standalone debt', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()]);
    mockPrisma.expense.findMany.mockResolvedValue([
      { amount: 0, categoryId: 'cat-1', categorySplits: [] },
    ]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    // The overall check and the per-category check now share ONE query (the
    // ABA-529 review's "stop issuing two identical queries" fix), so there is
    // exactly one findMany call here, not two — asserting by index would
    // silently start reading whatever call happens to land at that position.
    // Find it by a marker instead: `categoryOrSplitFilter`'s `where.OR`,
    // which only the category-scoped query carries.
    const call = (mockPrisma.expense.findMany as jest.Mock).mock.calls.find(
      (c: any[]) => c[0]?.where?.OR,
    );
    expect(call).toBeDefined();
    const where = call![0].where;
    // The marker the split feature sets — must be filtered out.
    expect(where.isSplitReceivable).toBe(false);
    // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
    // filtering on it would rewrite the numbers of every user tracking debts.
    expect(where.isDebt).toBeUndefined();
  });
});

/**
 * A budget on a category a receipt only reaches through a split used to read
 * zero, and one on the receipt's own category absorbed the whole receipt.
 * See docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 */
describe('BudgetAlertService — thresholds count category splits', () => {
  let service: BudgetAlertService;

  const HOUSEHOLD = 'cat-household';
  const GROCERIES = 'cat-groceries';

  /** The reported receipt: 240, of which only 35 is household. */
  const splitRow = {
    amount: 240,
    categoryId: GROCERIES,
    categorySplits: [
      { categoryId: GROCERIES, amount: 205 },
      { categoryId: HOUSEHOLD, amount: 35 },
    ],
  };

  const householdBudget = (allocated: number, overall: number) =>
    makeBudget({
      amount: overall,
      categoryAllocations: [
        { categoryId: HOUSEHOLD, amount: allocated, isDeleted: false, category: { id: HOUSEHOLD, name: 'Household' } },
      ],
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.expense.groupBy.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([splitRow]);
    mockPrisma.budgetAlert.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.budgetAlert.update.mockResolvedValue({});
    mockNotifications.sendToUser.mockResolvedValue(true);
    mockPrisma.budgetAlert.findFirst.mockImplementation(async (args: any) =>
      args?.orderBy ? { id: 'alert-id', notificationSent: false } : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetAlertService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<BudgetAlertService>(BudgetAlertService);
  });

  it('fires for a split-only category that is over its allocation', async () => {
    // 35 attributed against a 30 allocation. This budget used to read 0 and
    // never alert at all — the reported bug, at the notification layer.
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(30, 1000)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === HOUSEHOLD,
    );
    expect(categoryCalls.length).toBeGreaterThan(0);
  });

  it('measures on the attributed share, not the whole receipt', async () => {
    // 35 of a 100 allocation is 35% — under every threshold. The whole 240
    // would be 240% and fire all three.
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(100, 1000)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const categoryCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => c[3]?.categoryId === HOUSEHOLD,
    );
    expect(categoryCalls).toHaveLength(0);
  });

  it('asks for expenses whose own category OR a split matches', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(100, 1000)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { categoryId: { in: [HOUSEHOLD] } },
      { categorySplits: { some: { isDeleted: false, categoryId: { in: [HOUSEHOLD] } } } },
    ]);
    expect(where.isPlanned).toBe(false);
    expect(where.isSplitReceivable).toBe(false);
  });

  it('measures the overall threshold on the attributed share too', async () => {
    // Overall allocation-scoped spend is 35, not 240. Against a 100 overall
    // amount that is 35% and silent; the unattributed 240 would be 240%.
    mockPrisma.budget.findMany.mockResolvedValue([householdBudget(1000, 100)]);

    await service.checkBudgetsForAccount('acc-1', 'PLN');

    const overallCalls = mockNotifications.sendToUser.mock.calls.filter(
      (c: any[]) => !c[3]?.categoryId,
    );
    expect(overallCalls).toHaveLength(0);
  });
});
