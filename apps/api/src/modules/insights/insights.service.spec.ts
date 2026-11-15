import { Test } from '@nestjs/testing';
import { InsightsService } from './insights.service';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';

// NOTE: unlike ai-insights/fat-finder/story, InsightsService does NOT depend on
// (or call) AiInsightsService / FatFinderService / StoryService — those are
// wired directly into InsightsController (see insights.controller.ts), which
// dispatches each route straight to its own service. InsightsService itself is
// the rule-based (non-LLM) anomaly/prediction engine behind `GET /insights`.
// Orchestration across the three AI sub-services is covered separately in
// insights.controller.ai-routes.spec.ts.

function buildDeps() {
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const budgetsService: any = {
    getProgress: jest.fn(),
    getAccountAnchorDay: jest.fn().mockResolvedValue(null),
  };
  // 1 USD = 4 PLN = 0.9 EUR
  const exchangeRateService: any = {
    getRates: jest.fn().mockResolvedValue({ rates: { USD: 1, PLN: 4, EUR: 0.9 } }),
  };
  return { prisma, budgetsService, exchangeRateService };
}

describe('InsightsService', () => {
  let service: InsightsService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: PrismaService, useValue: deps.prisma },
        { provide: BudgetsService, useValue: deps.budgetsService },
        { provide: ExchangeRateService, useValue: deps.exchangeRateService },
      ],
    }).compile();
    service = moduleRef.get(InsightsService);
  });

  describe('getInsights — encryption gate', () => {
    it('returns encryptionRestricted and skips DB queries when full E2E encryption is on', async () => {
      deps.prisma.account.findUnique.mockResolvedValueOnce({ encryptionTier: 2 });
      const res = await service.getInsights('acc-1');
      expect(res).toEqual({ encryptionRestricted: true, anomalies: [], predictions: [] });
      expect(deps.prisma.expense.findMany).not.toHaveBeenCalled();
      expect(deps.prisma.budget.findMany).not.toHaveBeenCalled();
    });

    it('merges anomalies and predictions when encryption is off', async () => {
      const now = new Date();
      const currentMonthExpense = {
        amount: '260' as any,
        categoryId: 'cat-1',
        category: { name: 'Dining' },
        date: new Date(now.getFullYear(), now.getMonth(), 1),
      };
      const prevExpense = (monthsAgo: number) => ({
        amount: '100' as any,
        categoryId: 'cat-1',
        category: { name: 'Dining' },
        date: new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1),
      });

      deps.prisma.expense.findMany
        .mockResolvedValueOnce([currentMonthExpense]) // detectSpendingAnomalies: current month
        .mockResolvedValueOnce([prevExpense(1), prevExpense(2)]); // detectSpendingAnomalies: previous 3 months

      deps.prisma.budget.findMany.mockResolvedValueOnce([
        { id: 'b1', name: 'Groceries', currencyCode: 'USD' },
      ]);
      deps.budgetsService.getProgress.mockResolvedValueOnce({
        estimatedExhaustionDate: '2026-08-01',
        dailyBurnRate: 10,
        daysRemaining: 5,
        projectedTotal: 200,
      });

      const res = await service.getInsights('acc-1');
      expect(res.anomalies).toHaveLength(1);
      expect(res.anomalies[0]).toMatchObject({ categoryId: 'cat-1', categoryName: 'Dining' });
      expect(res.predictions).toEqual([
        {
          budgetId: 'b1',
          budgetName: 'Groceries',
          estimatedExhaustionDate: '2026-08-01',
          dailyBurnRate: 10,
          daysRemaining: 5,
          projectedTotal: 200,
          currencyCode: 'USD',
        },
      ]);
    });
  });

  describe('detectSpendingAnomalies', () => {
    // Fixed clock: 10 June 2026 — ten days into the month.
    const NOW = new Date(2026, 5, 10, 12, 0, 0);
    const row = (amount: number, categoryId: string, name: string, date: Date, extra: Record<string, unknown> = {}) => ({
      amount: String(amount) as any,
      currencyCode: 'USD',
      categoryId,
      category: { id: categoryId, name },
      categorySplits: [],
      date,
      ...extra,
    });

    it('flags a category that spends 30%+ above its 3-month trailing average', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([row(260, 'cat-1', 'Dining', new Date(2026, 5, 5))])
        .mockResolvedValueOnce([
          row(100, 'cat-1', 'Dining', new Date(2026, 4, 5)),
          row(100, 'cat-1', 'Dining', new Date(2026, 3, 5)),
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].percentageChange).toBe(160); // (260-100)/100 * 100
      expect(anomalies[0].categoryName).toBe('Dining');
      expect(anomalies[0].period).toBe('2026-06');
    });

    it('compares the same days of earlier months, not whole months', async () => {
      // 10 days into June: May's spend after the 10th must not inflate "usual".
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([row(150, 'cat-1', 'Dining', new Date(2026, 5, 3))])
        .mockResolvedValueOnce([
          row(100, 'cat-1', 'Dining', new Date(2026, 4, 4)),
          row(900, 'cat-1', 'Dining', new Date(2026, 4, 25)),
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].averageAmount).toBe(100);
      expect(anomalies[0].percentageChange).toBe(50);
    });

    it('converts every currency into the base currency before summing', async () => {
      // 400 PLN = 100 USD this month vs 100 USD before: no change, no anomaly.
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([row(400, 'cat-1', 'Dining', new Date(2026, 5, 3), { currencyCode: 'PLN' })])
        .mockResolvedValueOnce([row(100, 'cat-1', 'Dining', new Date(2026, 4, 3))]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies).toEqual([]);
      expect(deps.exchangeRateService.getRates).toHaveBeenCalledWith('USD');
    });

    it('leaves out an amount with no known rate instead of summing it unconverted', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([row(5000, 'cat-1', 'Dining', new Date(2026, 5, 3), { currencyCode: 'XYZ' })])
        .mockResolvedValueOnce([row(100, 'cat-1', 'Dining', new Date(2026, 4, 3))]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies).toEqual([]);
    });

    it('attributes a split receipt to its split categories', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          row(300, 'cat-food', 'Food', new Date(2026, 5, 3), {
            categorySplits: [
              { categoryId: 'cat-food', amount: '100', category: { id: 'cat-food', name: 'Food' } },
              { categoryId: 'cat-alc', amount: '200', category: { id: 'cat-alc', name: 'Alcohol' } },
            ],
          }),
        ])
        .mockResolvedValueOnce([
          row(100, 'cat-food', 'Food', new Date(2026, 4, 3)),
          row(50, 'cat-alc', 'Alcohol', new Date(2026, 4, 3)),
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies.map((a) => a.categoryId)).toEqual(['cat-alc']);
      expect(anomalies[0].currentAmount).toBe(200);
    });

    it('queries spend only: no planned expenses, no split receivables', async () => {
      await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      for (const call of deps.prisma.expense.findMany.mock.calls) {
        expect(call[0].where).toMatchObject({ isDeleted: false, isPlanned: false, isSplitReceivable: false });
      }
    });

    it('does not flag a category within normal range (< 30% change)', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([row(110, 'cat-1', 'Dining', new Date(2026, 5, 5))])
        .mockResolvedValueOnce([row(100, 'cat-1', 'Dining', new Date(2026, 4, 5))]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies).toEqual([]);
    });

    it('skips a category with no previous-month history (nothing to compare against)', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([row(500, 'cat-new', 'New', new Date(2026, 5, 5))])
        .mockResolvedValueOnce([]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies).toEqual([]);
    });

    it('sorts multiple anomalies by percentageChange descending', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          row(200, 'cat-a', 'A', new Date(2026, 5, 5)),
          row(500, 'cat-b', 'B', new Date(2026, 5, 6)),
        ])
        .mockResolvedValueOnce([
          row(100, 'cat-a', 'A', new Date(2026, 4, 5)),
          row(100, 'cat-b', 'B', new Date(2026, 4, 6)),
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1', 'USD', NOW);
      expect(anomalies.map((a) => a.categoryId)).toEqual(['cat-b', 'cat-a']); // B changed 400%, A changed 100%
    });
  });

  describe('getBudgetPredictions', () => {
    it('maps budget progress into predictions', async () => {
      deps.prisma.budget.findMany.mockResolvedValueOnce([
        { id: 'b1', name: 'Groceries', currencyCode: 'USD' },
        { id: 'b2', name: 'Transport', currencyCode: 'EUR' },
      ]);
      deps.budgetsService.getProgress
        .mockResolvedValueOnce({ estimatedExhaustionDate: undefined, dailyBurnRate: 5, daysRemaining: 10, projectedTotal: 150 })
        .mockResolvedValueOnce({ estimatedExhaustionDate: '2026-08-15', dailyBurnRate: 2, daysRemaining: 20, projectedTotal: 40 });

      const predictions = await service.getBudgetPredictions('acc-1');
      expect(predictions).toHaveLength(2);
      expect(predictions[0]).toMatchObject({ budgetId: 'b1', currencyCode: 'USD', dailyBurnRate: 5 });
      expect(predictions[1]).toMatchObject({ budgetId: 'b2', currencyCode: 'EUR', estimatedExhaustionDate: '2026-08-15' });
    });

    it('resolves the account anchor once and forwards it to every getProgress call, so predictions agree with GET /budgets/:id/progress', async () => {
      deps.prisma.budget.findMany.mockResolvedValueOnce([
        { id: 'b1', name: 'Groceries', currencyCode: 'USD' },
        { id: 'b2', name: 'Transport', currencyCode: 'EUR' },
      ]);
      deps.budgetsService.getAccountAnchorDay.mockResolvedValueOnce(15);
      deps.budgetsService.getProgress
        .mockResolvedValueOnce({ estimatedExhaustionDate: undefined, dailyBurnRate: 5, daysRemaining: 10, projectedTotal: 150 })
        .mockResolvedValueOnce({ estimatedExhaustionDate: '2026-08-15', dailyBurnRate: 2, daysRemaining: 20, projectedTotal: 40 });

      await service.getBudgetPredictions('acc-1');

      expect(deps.budgetsService.getAccountAnchorDay).toHaveBeenCalledTimes(1);
      expect(deps.budgetsService.getAccountAnchorDay).toHaveBeenCalledWith('acc-1');
      expect(deps.budgetsService.getProgress).toHaveBeenNthCalledWith(1, 'acc-1', 'b1', 15);
      expect(deps.budgetsService.getProgress).toHaveBeenNthCalledWith(2, 'acc-1', 'b2', 15);
    });

    it('skips a budget whose getProgress call throws, without failing the whole batch', async () => {
      deps.prisma.budget.findMany.mockResolvedValueOnce([
        { id: 'b1', name: 'Groceries', currencyCode: 'USD' },
        { id: 'b2', name: 'Transport', currencyCode: 'EUR' },
      ]);
      deps.budgetsService.getProgress
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ estimatedExhaustionDate: '2026-08-15', dailyBurnRate: 2, daysRemaining: 20, projectedTotal: 40 });

      const predictions = await service.getBudgetPredictions('acc-1');
      expect(predictions).toHaveLength(1);
      expect(predictions[0].budgetId).toBe('b2');
    });
  });
});
