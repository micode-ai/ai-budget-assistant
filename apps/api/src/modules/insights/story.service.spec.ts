import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StoryService } from './story.service';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

function buildDeps() {
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    spendingStory: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null }) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    income: { findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const budgetsService = {
    getProgress: jest.fn(),
    getAccountAnchorDay: jest.fn().mockResolvedValue(null),
  };
  const subscriptionsService = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
  const exchangeRateService = {
    getRates: jest.fn().mockResolvedValue({ base: 'USD', rates: { USD: 1, EUR: 0.9, PLN: 4 }, updatedAt: '' }),
  };
  return { prisma, budgetsService, subscriptionsService, exchangeRateService };
}

/** The prompt text sent to OpenAI on the first (only) call. */
function promptSent() {
  return mockChatCreate.mock.calls[0][0].messages[0].content as string;
}

describe('StoryService', () => {
  let service: StoryService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    mockChatCreate.mockReset();
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StoryService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: deps.prisma },
        { provide: BudgetsService, useValue: deps.budgetsService },
        { provide: SubscriptionsService, useValue: deps.subscriptionsService },
        { provide: ExchangeRateService, useValue: deps.exchangeRateService },
      ],
    }).compile();
    service = moduleRef.get(StoryService);
  });

  describe('encryption gate', () => {
    it('returns encryptionRestricted with an empty story when full E2E encryption is on', async () => {
      deps.prisma.account.findUnique.mockResolvedValueOnce({ encryptionTier: 2 });
      const res = await service.getSpendingStory('acc-1', 'month', false, 'en', 'user-1', 7, 2026);
      expect(res.encryptionRestricted).toBe(true);
      expect(res.story.blocks).toEqual([]);
      expect(mockChatCreate).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('returns the cached story for the same period/label without calling OpenAI', async () => {
      const periodStart = new Date(2026, 6, 1);
      const periodEnd = new Date(2026, 7, 0);
      const cached = {
        id: 's1',
        accountId: 'acc-1',
        periodLabel: 'July 2026',
        periodStart,
        periodEnd,
        blocks: [{ type: 'hero_metric', order: 1, content: { title: 'x' } }],
        summary: 'Cached summary',
        // Must match the caller's display currency or the row is a cache miss (ABA-387);
        // 'USD' is getSpendingStory's baseCurrency default.
        currencyCode: 'USD',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date('2026-07-10T00:00:00Z'),
      };
      deps.prisma.spendingStory.findUnique.mockResolvedValueOnce(cached);

      const res = await service.getSpendingStory('acc-1', 'month', false, 'en', 'user-1', 7, 2026);
      expect(res.isStale).toBe(false);
      expect(res.story.id).toBe('s1');
      expect(res.story.summary).toBe('Cached summary');
      expect(mockChatCreate).not.toHaveBeenCalled();
      expect(deps.prisma.expense.findMany).not.toHaveBeenCalled();
    });
  });

  describe('generation — happy path', () => {
    it('parses story blocks JSON, persists via upsert, and tracks AI usage', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([]) // current period
        .mockResolvedValueOnce([]); // previous period
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);

      mockChatCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                blocks: [
                  { type: 'hero_metric', order: 1, content: { title: 'Total spent', metrics: [], tone: 'positive' } },
                ],
                summary: 'Great month!',
              }),
            },
          },
        ],
      });

      deps.prisma.spendingStory.upsert.mockResolvedValueOnce({
        id: 's2',
        accountId: 'acc-1',
        periodLabel: 'July 2026',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        blocks: [{ type: 'hero_metric', order: 1, content: { title: 'Total spent', metrics: [], tone: 'positive' } }],
        summary: 'Great month!',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const res = await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026);
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      expect(res.story.id).toBe('s2');
      expect(res.story.summary).toBe('Great month!');
      expect(res.story.blocks).toHaveLength(1);
      // aiModel null => balanced multiplier (1.0) => cost stays 3.0
      expect(deps.subscriptionsService.trackAiUsage).toHaveBeenCalledWith('user-1', 'story', 3.0, 'acc-1');
    });

    it('localizes remaining English labels in story blocks for a non-English language', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);

      mockChatCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                blocks: [
                  { type: 'chart', order: 1, content: { title: 'Spending', chartConfig: { chartType: 'donut', title: 'x', data: [{ label: 'Uncategorized', value: 10 }] } } },
                ],
                summary: 'Podsumowanie',
              }),
            },
          },
        ],
      });

      deps.prisma.spendingStory.upsert.mockImplementationOnce(({ create }: any) => Promise.resolve({
        id: 's3',
        accountId: 'acc-1',
        periodLabel: 'Lipiec 2026',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        blocks: create.blocks,
        summary: create.summary,
        createdAt: new Date('2026-07-18T00:00:00Z'),
      }));

      const res = await service.getSpendingStory('acc-1', 'month', true, 'pl', 'user-1', 7, 2026);
      const chartBlock = res.story.blocks[0] as any;
      expect(chartBlock.content.chartConfig.data[0].label).toBe('Bez kategorii');
    });
  });

  describe('malformed OpenAI response', () => {
    it('degrades to an empty story when the model returns non-JSON content', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not valid json' } }] });

      deps.prisma.spendingStory.upsert.mockResolvedValueOnce({
        id: 's4',
        accountId: 'acc-1',
        periodLabel: 'July 2026',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        blocks: [],
        summary: '',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const res = await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026);
      expect(res.story.blocks).toEqual([]);
      expect(res.story.summary).toBe('');
      expect(deps.subscriptionsService.trackAiUsage).toHaveBeenCalled();
    });
  });

  describe('budget anchor propagation', () => {
    it('resolves the account anchor once and forwards it to every getProgress call, so the story agrees with GET /budgets/:id/progress', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([
        { id: 'b1', name: 'Groceries', amount: '300' as any, currencyCode: 'USD' },
        { id: 'b2', name: 'Transport', amount: '100' as any, currencyCode: 'EUR' },
      ]);
      deps.budgetsService.getAccountAnchorDay.mockResolvedValueOnce(15);
      deps.budgetsService.getProgress
        .mockResolvedValueOnce({ spent: 120, percentageUsed: 40 })
        .mockResolvedValueOnce({ spent: 50, percentageUsed: 50 });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ blocks: [], summary: 'ok' }) } }],
      });
      deps.prisma.spendingStory.upsert.mockResolvedValueOnce({
        id: 's5',
        accountId: 'acc-1',
        periodLabel: 'July 2026',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        blocks: [],
        summary: 'ok',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026);

      expect(deps.budgetsService.getAccountAnchorDay).toHaveBeenCalledTimes(1);
      expect(deps.budgetsService.getAccountAnchorDay).toHaveBeenCalledWith('acc-1');
      expect(deps.budgetsService.getProgress).toHaveBeenNthCalledWith(1, 'acc-1', 'b1', 15);
      expect(deps.budgetsService.getProgress).toHaveBeenNthCalledWith(2, 'acc-1', 'b2', 15);
    });
  });

  describe('OpenAI call failure', () => {
    it('returns an unavailable-story fallback and does not track usage when the OpenAI call throws', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      mockChatCreate.mockRejectedValueOnce(new Error('rate limited'));

      const res = await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026);
      expect(res.isStale).toBe(true);
      expect(res.story.blocks).toEqual([]);
      expect(res.story.summary).toBe('Unable to generate story at this time.');
      expect(deps.prisma.spendingStory.upsert).not.toHaveBeenCalled();
      expect(deps.subscriptionsService.trackAiUsage).not.toHaveBeenCalled();
    });
  });

  // ABA-387: the story used to be labelled `currentExpenses[0]?.currencyCode` — the
  // currency of the account's LARGEST expense (the query is ordered by amount desc) —
  // and every amount from every currency was summed under it. Same defect class as the
  // Fat Finder audit fixed in ABA-386.
  describe('display currency / FX conversion', () => {
    const expenseRow = (over: Record<string, unknown> = {}) => ({
      id: 'e1',
      amount: '100' as any,
      currencyCode: 'PLN',
      description: 'Biedronka',
      date: new Date(2026, 6, 20),
      categoryId: 'c1',
      category: { name: 'Groceries', color: '#fff' },
      ...over,
    });

    function mockGeneration(id: string) {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ blocks: [], summary: 'ok' }) } }],
      });
      deps.prisma.spendingStory.upsert.mockImplementationOnce(({ create }: any) => Promise.resolve({
        ...create,
        id,
        createdAt: new Date('2026-07-26T00:00:00Z'),
      }));
    }

    it('labels the story in the caller display currency and converts every amount into it', async () => {
      // Largest expense first (mirrors orderBy amount desc): a USD charge in a PLN account.
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          expenseRow({ id: 'e-usd', amount: '10', currencyCode: 'USD', description: 'Claude' }),
          expenseRow({ id: 'e-pln', amount: '100', currencyCode: 'PLN' }),
        ])
        .mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([{ amount: '23' as any, currencyCode: 'EUR' }]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      // 1 PLN = 0.25 USD = 0.23 EUR
      deps.exchangeRateService.getRates.mockResolvedValueOnce({ base: 'PLN', rates: { PLN: 1, USD: 0.25, EUR: 0.23 }, updatedAt: '' });
      mockGeneration('s-pln');

      await service.getSpendingStory('acc-1', 'month', true, 'ru', 'user-1', 7, 2026, 'PLN');

      expect(deps.exchangeRateService.getRates).toHaveBeenCalledWith('PLN');
      expect(promptSent()).toContain('- Currency: PLN');
      expect(promptSent()).toContain('- Total spent: 140.00');   // 100 PLN + 10 USD -> 40 PLN
      expect(promptSent()).toContain('- Total income: 100.00');  // 23 EUR -> 100 PLN
      expect(promptSent()).toContain('- Net savings: -40.00');
      expect(deps.prisma.spendingStory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ currencyCode: 'PLN' }) }),
      );
    });

    it('converts budget limits and spend out of the budget currency', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([
        { id: 'b1', name: 'Transport', amount: '100' as any, currencyCode: 'EUR' },
      ]);
      deps.budgetsService.getProgress.mockResolvedValueOnce({ spent: 23, percentageUsed: 23 });
      deps.exchangeRateService.getRates.mockResolvedValueOnce({ base: 'PLN', rates: { PLN: 1, EUR: 0.23 }, updatedAt: '' });
      mockGeneration('s-budget');

      await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026, 'PLN');

      // 100 EUR limit -> 434.78 PLN, 23 EUR spent -> 100 PLN; percentUsed is currency-agnostic.
      expect(promptSent()).toContain('434.78');
      expect(promptSent()).toContain('"spent":100');
    });

    it('regenerates instead of serving a cached story in another currency', async () => {
      deps.prisma.spendingStory.findUnique.mockResolvedValueOnce({
        id: 's-stale-usd',
        accountId: 'acc-1',
        periodLabel: 'July 2026',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        blocks: [],
        summary: 'Cached in dollars',
        currencyCode: 'USD',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date('2026-08-03T00:00:00Z'),
      });
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      mockGeneration('s-fresh');

      const res = await service.getSpendingStory('acc-1', 'month', false, 'en', 'user-1', 7, 2026, 'PLN');

      expect(deps.prisma.expense.findMany).toHaveBeenCalled();
      expect(res.story.id).toBe('s-fresh');
    });

    it('skips the rate lookup when everything is already in the display currency', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([expenseRow()]).mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      mockGeneration('s-single');

      const res = await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026, 'PLN');

      expect(deps.exchangeRateService.getRates).not.toHaveBeenCalled();
      expect(res.fxApproximate).toBeFalsy();
      expect(promptSent()).toContain('- Currency: PLN');
    });

    it('excludes amounts with no known rate and reports fxApproximate', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([
          expenseRow({ id: 'e-gbp', amount: '20', currencyCode: 'GBP' }),
          expenseRow({ id: 'e-pln', amount: '100', currencyCode: 'PLN' }),
        ])
        .mockResolvedValueOnce([]);
      deps.prisma.income.findMany.mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      deps.exchangeRateService.getRates.mockResolvedValueOnce({ base: 'PLN', rates: { PLN: 1, USD: 0.25 }, updatedAt: '' });
      mockGeneration('s-approx');

      const res = await service.getSpendingStory('acc-1', 'month', true, 'en', 'user-1', 7, 2026, 'PLN');

      expect(res.fxApproximate).toBe(true);
      expect(promptSent()).toContain('- Total spent: 100.00');
    });
  });
});
