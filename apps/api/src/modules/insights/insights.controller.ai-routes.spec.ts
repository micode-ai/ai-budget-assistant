import { InsightsController } from './insights.controller';

// The task of "which AI sub-service is called for which route" is NOT owned by
// InsightsService (it has no dependency on AiInsightsService / StoryService /
// FatFinderService — see insights.service.spec.ts's header note); it is owned by
// InsightsController, which dispatches each route directly to its own service.
// This spec mirrors the existing insights.controller.shield.spec.ts convention
// (direct instantiation, positional constructor args, unused deps as `undefined`).

function buildController(overrides: {
  insightsService?: any;
  aiInsightsService?: any;
  storyService?: any;
  fatFinderService?: any;
}) {
  const insightsService = overrides.insightsService ?? { getInsights: jest.fn() };
  const aiInsightsService = overrides.aiInsightsService ?? { getAIInsights: jest.fn() };
  const storyService = overrides.storyService ?? { getSpendingStory: jest.fn() };
  const fatFinderService = overrides.fatFinderService ?? { generateReport: jest.fn() };

  const ctrl = new InsightsController(
    insightsService,
    aiInsightsService,
    storyService,
    fatFinderService,
    undefined as any, // safeToSpendService — not exercised here
    undefined as any, // wrappedService — not exercised here
    undefined as any, // inflationShieldService — not exercised here
  );

  return { ctrl, insightsService, aiInsightsService, storyService, fatFinderService };
}

describe('InsightsController — AI route dispatch', () => {
  const req: any = { accountId: 'acc-1', user: { id: 'user-1', currencyCode: 'USD' } };

  it('GET /insights dispatches to InsightsService.getInsights only', async () => {
    const { ctrl, insightsService, aiInsightsService, storyService, fatFinderService } = buildController({
      insightsService: { getInsights: jest.fn().mockResolvedValue({ anomalies: [], predictions: [] }) },
    });
    const res = await ctrl.getInsights(req);
    expect(insightsService.getInsights).toHaveBeenCalledWith('acc-1');
    expect(res).toEqual({ anomalies: [], predictions: [] });
    expect(aiInsightsService.getAIInsights).not.toHaveBeenCalled();
    expect(storyService.getSpendingStory).not.toHaveBeenCalled();
    expect(fatFinderService.generateReport).not.toHaveBeenCalled();
  });

  it('GET /insights/ai-charts dispatches to AiInsightsService.getAIInsights with accountId/language/userId', async () => {
    const { ctrl, aiInsightsService } = buildController({
      aiInsightsService: { getAIInsights: jest.fn().mockResolvedValue({ insights: [] }) },
    });
    const res = await ctrl.getAICharts(req, 'pl');
    expect(aiInsightsService.getAIInsights).toHaveBeenCalledWith('acc-1', 'pl', 'user-1');
    expect(res).toEqual({ insights: [] });
  });

  it('POST /insights/story dispatches to StoryService.getSpendingStory, defaulting period to "month"', async () => {
    const { ctrl, storyService } = buildController({
      storyService: { getSpendingStory: jest.fn().mockResolvedValue({ story: {}, isStale: false }) },
    });
    await ctrl.getSpendingStory(req, { period: undefined as any, forceRegenerate: true, language: 'ru', month: 7, year: 2026 });
    expect(storyService.getSpendingStory).toHaveBeenCalledWith('acc-1', 'month', true, 'ru', 'user-1', 7, 2026);
  });

  it('POST /insights/story passes through an explicit period', async () => {
    const { ctrl, storyService } = buildController({
      storyService: { getSpendingStory: jest.fn().mockResolvedValue({ story: {}, isStale: false }) },
    });
    await ctrl.getSpendingStory(req, { period: 'week', forceRegenerate: false, language: 'en' });
    expect(storyService.getSpendingStory).toHaveBeenCalledWith('acc-1', 'week', false, 'en', 'user-1', undefined, undefined);
  });

  it('POST /insights/fat-finder dispatches to FatFinderService.generateReport', async () => {
    const { ctrl, fatFinderService } = buildController({
      fatFinderService: { generateReport: jest.fn().mockResolvedValue({ report: {}, isStale: false }) },
    });
    await ctrl.getFatFinderReport(req, { forceRegenerate: true, language: 'de', month: 3, year: 2025 });
    expect(fatFinderService.generateReport).toHaveBeenCalledWith('acc-1', 'de', true, 'user-1', 3, 2025);
  });

  it('routes are independent — calling one AI route never touches the others', async () => {
    const { ctrl, aiInsightsService, storyService, fatFinderService } = buildController({
      fatFinderService: { generateReport: jest.fn().mockResolvedValue({ report: {}, isStale: false }) },
    });
    await ctrl.getFatFinderReport(req, {});
    expect(aiInsightsService.getAIInsights).not.toHaveBeenCalled();
    expect(storyService.getSpendingStory).not.toHaveBeenCalled();
    expect(fatFinderService.generateReport).toHaveBeenCalled();
  });
});
