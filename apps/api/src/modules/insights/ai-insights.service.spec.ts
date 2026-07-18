import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiInsightsService } from './ai-insights.service';
import { PrismaService } from '../../database/prisma.service';
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
    generatedInsight: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null }) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    budget: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const subscriptionsService = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
  return { prisma, subscriptionsService };
}

describe('AiInsightsService', () => {
  let service: AiInsightsService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    mockChatCreate.mockReset();
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiInsightsService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: deps.prisma },
        { provide: SubscriptionsService, useValue: deps.subscriptionsService },
      ],
    }).compile();
    service = moduleRef.get(AiInsightsService);
  });

  describe('encryption gate', () => {
    it('returns encryptionRestricted without touching cache/OpenAI when full E2E encryption is on', async () => {
      deps.prisma.account.findUnique.mockResolvedValueOnce({ encryptionTier: 2 });
      const res = await service.getAIInsights('acc-1', 'en', 'user-1');
      expect(res.encryptionRestricted).toBe(true);
      expect(res.insights).toEqual([]);
      expect(deps.prisma.generatedInsight.findMany).not.toHaveBeenCalled();
      expect(mockChatCreate).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('returns cached insights for the current period without calling OpenAI', async () => {
      const createdAt = new Date('2026-07-01T00:00:00Z');
      deps.prisma.generatedInsight.findMany.mockResolvedValueOnce([
        {
          id: 'i1',
          insightType: 'trend_change',
          title: 'Cached title',
          description: 'Cached desc',
          severity: 'info',
          chartConfig: { chartType: 'bar', title: 'x', data: [] },
          actionSuggestion: 'Do X',
          createdAt,
        },
      ]);

      const res = await service.getAIInsights('acc-1', 'en', 'user-1');
      expect(res.insights).toHaveLength(1);
      expect(res.insights[0]).toMatchObject({ id: 'i1', title: 'Cached title' });
      expect(mockChatCreate).not.toHaveBeenCalled();
    });
  });

  describe('generation — happy path', () => {
    it('parses the JSON array response, saves insights, and tracks AI usage', async () => {
      deps.prisma.expense.findMany
        .mockResolvedValueOnce([]) // current month
        .mockResolvedValueOnce([]); // previous 3 months
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);

      mockChatCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  insightType: 'trend_change',
                  title: 'T1',
                  description: 'D1',
                  severity: 'info',
                  chartConfig: { chartType: 'bar', title: 'x', data: [] },
                  actionSuggestion: 'A1',
                },
              ]),
            },
          },
        ],
      });

      deps.prisma.generatedInsight.create.mockResolvedValueOnce({
        id: 'i2',
        insightType: 'trend_change',
        title: 'T1',
        description: 'D1',
        severity: 'info',
        chartConfig: { chartType: 'bar', title: 'x', data: [] },
        actionSuggestion: 'A1',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const res = await service.getAIInsights('acc-1', 'en', 'user-1');
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      expect(res.insights).toHaveLength(1);
      expect(res.insights[0]).toMatchObject({ id: 'i2', title: 'T1' });
      // aiModel null => balanced multiplier (1.0) => cost stays 2.0
      expect(deps.subscriptionsService.trackAiUsage).toHaveBeenCalledWith('user-1', 'insights', 2.0, 'acc-1');
    });
  });

  describe('malformed OpenAI response', () => {
    it('degrades to an empty insight list when the model returns non-JSON content', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not valid json' } }] });

      const res = await service.getAIInsights('acc-1', 'en', 'user-1');
      expect(res.insights).toEqual([]);
      expect(deps.prisma.generatedInsight.create).not.toHaveBeenCalled();
      // Usage is still tracked — the OpenAI call itself succeeded, only parsing failed.
      expect(deps.subscriptionsService.trackAiUsage).toHaveBeenCalled();
    });
  });

  describe('OpenAI call failure', () => {
    it('returns an empty insight list and does not track usage when the OpenAI call throws', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      deps.prisma.budget.findMany.mockResolvedValueOnce([]);
      mockChatCreate.mockRejectedValueOnce(new Error('rate limited'));

      const res = await service.getAIInsights('acc-1', 'en', 'user-1');
      expect(res.insights).toEqual([]);
      expect(res.encryptionRestricted).toBeUndefined();
      expect(deps.prisma.generatedInsight.create).not.toHaveBeenCalled();
      expect(deps.subscriptionsService.trackAiUsage).not.toHaveBeenCalled();
    });
  });
});
