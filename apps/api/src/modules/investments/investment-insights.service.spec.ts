import { InvestmentInsightsService } from './investment-insights.service';

function makeDeps(overrides: any = {}) {
  const configService = { get: jest.fn().mockReturnValue('test-key') } as any;
  const prisma = {
    generatedInsight: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'insight-1', createdAt: new Date('2026-01-01'), ...data })),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null }) },
    ...overrides.prisma,
  };
  const investmentsService = {
    getPortfolioSummary: jest.fn().mockResolvedValue({
      summary: { totalValue: 0, totalInvested: 0, totalPnL: 0, totalPnLPercent: 0, holdings: [] },
    }),
    getPortfolioAnalytics: jest.fn().mockResolvedValue({
      performance: { dates: [], values: [], investedValues: [] },
      allocation: [],
      topGainers: [],
      topLosers: [],
    }),
    getTransactions: jest.fn().mockResolvedValue([]),
    ...overrides.investmentsService,
  } as any;
  const subscriptionsService = { trackAiUsage: jest.fn().mockResolvedValue(undefined), ...overrides.subscriptionsService } as any;

  const service = new InvestmentInsightsService(configService, prisma as any, investmentsService, subscriptionsService);
  return { service, prisma, investmentsService, subscriptionsService };
}

describe('InvestmentInsightsService.getInvestmentInsights', () => {
  it('returns cached, unexpired insights without calling OpenAI or gathering portfolio data', async () => {
    const cached = [
      {
        id: 'i-1',
        insightType: 'concentration_risk',
        title: 'Too concentrated',
        description: 'desc',
        severity: 'warning',
        chartConfig: {},
        actionSuggestion: 'diversify',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const { service, investmentsService } = makeDeps({
      prisma: { generatedInsight: { findMany: jest.fn().mockResolvedValue(cached) } },
    });

    const result = await service.getInvestmentInsights('acc-1', 'en', 'u1');

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]).toMatchObject({ id: 'i-1', insightType: 'concentration_risk' });
    expect(investmentsService.getPortfolioSummary).not.toHaveBeenCalled();
  });

  it('returns an empty insights array (and never calls OpenAI) when the portfolio has no holdings', async () => {
    const { service } = makeDeps();
    const openaiCreate = jest.fn();
    (service as any).openai = { chat: { completions: { create: openaiCreate } } };

    const result = await service.getInvestmentInsights('acc-1', 'en', 'u1');

    expect(result.insights).toEqual([]);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it('generates insights from a non-empty portfolio, validates insightType, and tracks AI usage only after a successful call', async () => {
    const { service, prisma, subscriptionsService } = makeDeps({
      investmentsService: {
        getPortfolioSummary: jest.fn().mockResolvedValue({
          summary: {
            totalValue: 1500,
            totalInvested: 1000,
            totalPnL: 500,
            totalPnLPercent: 50,
            holdings: [
              {
                symbol: 'AAPL', name: 'Apple', assetType: 'stock', quantity: 10,
                averageCostBasis: 100, currentPrice: 150, marketValue: 1500,
                totalInvested: 1000, pnl: 500, pnlPercent: 50, allocationPercent: 100,
              },
            ],
          },
        }),
        getPortfolioAnalytics: jest.fn().mockResolvedValue({
          performance: { dates: ['2026-01-01', '2026-01-31'], values: [1000, 1500], investedValues: [1000, 1000] },
          allocation: [{ assetType: 'stock', value: 1500, percentage: 100 }],
          topGainers: [{ symbol: 'AAPL', pnlPercent: 50 }],
          topLosers: [],
        }),
        getTransactions: jest.fn().mockResolvedValue([{ fee: 5 }]),
      },
    });

    const rawInsight = {
      insightType: 'concentration_risk',
      title: 'Heavy AAPL concentration',
      description: 'AAPL is 100% of the portfolio.',
      severity: 'critical',
      chartConfig: { chartType: 'donut', title: 'Allocation', data: [] },
      actionSuggestion: 'Diversify into other assets.',
    };
    const openaiCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ insights: [rawInsight, { insightType: 'not_a_real_type', title: 'x' }] }) } }],
    });
    (service as any).openai = { chat: { completions: { create: openaiCreate } } };

    const result = await service.getInvestmentInsights('acc-1', 'en', 'u1');

    expect(result.insights).toHaveLength(2);
    expect(prisma.generatedInsight.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ insightType: 'concentration_risk', severity: 'critical' }),
    }));
    // Unknown insightType from the model falls back to 'concentration_risk' rather than being dropped or crashing
    expect(prisma.generatedInsight.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ insightType: 'concentration_risk' }),
    }));
    expect(subscriptionsService.trackAiUsage).toHaveBeenCalledWith('u1', 'investment_insights', expect.any(Number), 'acc-1');
  });

  it('returns an empty insights array (never throws) when the OpenAI response body is not valid JSON', async () => {
    const { service, prisma } = makeDeps({
      investmentsService: {
        getPortfolioSummary: jest.fn().mockResolvedValue({
          summary: {
            totalValue: 100, totalInvested: 100, totalPnL: 0, totalPnLPercent: 0,
            holdings: [{ symbol: 'AAPL', name: 'Apple', assetType: 'stock', quantity: 1, averageCostBasis: 100, currentPrice: 100, marketValue: 100, totalInvested: 100, pnl: 0, pnlPercent: 0, allocationPercent: 100 }],
          },
        }),
      },
    });
    (service as any).openai = {
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] }) } },
    };

    const result = await service.getInvestmentInsights('acc-1', 'en', 'u1');

    expect(result.insights).toEqual([]);
    expect(prisma.generatedInsight.create).not.toHaveBeenCalled();
  });

  it('returns an empty insights array (never throws) when the OpenAI call itself rejects', async () => {
    const { service } = makeDeps({
      investmentsService: {
        getPortfolioSummary: jest.fn().mockResolvedValue({
          summary: {
            totalValue: 100, totalInvested: 100, totalPnL: 0, totalPnLPercent: 0,
            holdings: [{ symbol: 'AAPL', name: 'Apple', assetType: 'stock', quantity: 1, averageCostBasis: 100, currentPrice: 100, marketValue: 100, totalInvested: 100, pnl: 0, pnlPercent: 0, allocationPercent: 100 }],
          },
        }),
      },
    });
    (service as any).openai = {
      chat: { completions: { create: jest.fn().mockRejectedValue(new Error('rate limited')) } },
    };

    await expect(service.getInvestmentInsights('acc-1', 'en', 'u1')).resolves.toEqual(
      expect.objectContaining({ insights: [] }),
    );
  });
});
