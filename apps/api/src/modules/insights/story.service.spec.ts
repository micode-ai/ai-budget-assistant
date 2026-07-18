import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StoryService } from './story.service';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

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
  const budgetsService = { getProgress: jest.fn() };
  const subscriptionsService = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
  return { prisma, budgetsService, subscriptionsService };
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
});
