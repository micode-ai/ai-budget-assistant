import { Test } from '@nestjs/testing';
import { InsightsService } from './insights.service';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';

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
  return { prisma, budgetsService };
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
        date: new Date(now.getFullYear(), now.getMonth(), 5),
      };
      const prevExpense = (monthsAgo: number) => ({
        amount: '100' as any,
        categoryId: 'cat-1',
        category: { name: 'Dining' },
        date: new Date(now.getFullYear(), now.getMonth() - monthsAgo, 5),
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
    it('flags a category that spends 30%+ above its 3-month trailing average', async () => {
      const now = new Date();
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          { amount: '260' as any, categoryId: 'cat-1', category: { name: 'Dining' }, date: new Date(now.getFullYear(), now.getMonth(), 5) },
        ])
        .mockResolvedValueOnce([
          { amount: '100' as any, categoryId: 'cat-1', category: { name: 'Dining' }, date: new Date(now.getFullYear(), now.getMonth() - 1, 5) },
          { amount: '100' as any, categoryId: 'cat-1', category: { name: 'Dining' }, date: new Date(now.getFullYear(), now.getMonth() - 2, 5) },
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1');
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].percentageChange).toBe(160); // (260-100)/100 * 100
      expect(anomalies[0].categoryName).toBe('Dining');
    });

    it('does not flag a category within normal range (< 30% change)', async () => {
      const now = new Date();
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          { amount: '110' as any, categoryId: 'cat-1', category: { name: 'Dining' }, date: new Date(now.getFullYear(), now.getMonth(), 5) },
        ])
        .mockResolvedValueOnce([
          { amount: '100' as any, categoryId: 'cat-1', category: { name: 'Dining' }, date: new Date(now.getFullYear(), now.getMonth() - 1, 5) },
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1');
      expect(anomalies).toEqual([]);
    });

    it('skips a category with no previous-month history (nothing to compare against)', async () => {
      const now = new Date();
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          { amount: '500' as any, categoryId: 'cat-new', category: { name: 'New' }, date: new Date(now.getFullYear(), now.getMonth(), 5) },
        ])
        .mockResolvedValueOnce([]);

      const anomalies = await service.detectSpendingAnomalies('acc-1');
      expect(anomalies).toEqual([]);
    });

    it('sorts multiple anomalies by percentageChange descending', async () => {
      const now = new Date();
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          { amount: '200' as any, categoryId: 'cat-a', category: { name: 'A' }, date: new Date(now.getFullYear(), now.getMonth(), 5) },
          { amount: '500' as any, categoryId: 'cat-b', category: { name: 'B' }, date: new Date(now.getFullYear(), now.getMonth(), 6) },
        ])
        .mockResolvedValueOnce([
          { amount: '100' as any, categoryId: 'cat-a', category: { name: 'A' }, date: new Date(now.getFullYear(), now.getMonth() - 1, 5) },
          { amount: '100' as any, categoryId: 'cat-b', category: { name: 'B' }, date: new Date(now.getFullYear(), now.getMonth() - 1, 6) },
        ]);

      const anomalies = await service.detectSpendingAnomalies('acc-1');
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
