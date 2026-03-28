import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { InvestmentsService } from './investments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { getAiCostMultiplier } from '../ai/services/model-resolver';

@Injectable()
export class InvestmentInsightsService {
  private readonly logger = new Logger(InvestmentInsightsService.name);
  private readonly openai: OpenAI;

  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    ru: 'Russian',
    ua: 'Ukrainian',
    de: 'German',
    es: 'Spanish',
    fr: 'French',
    pl: 'Polish',
    be: 'Belarusian',
  };

  private static readonly INSIGHT_TYPES = [
    'concentration_risk',
    'sector_imbalance',
    'underperformer',
    'overperformer',
    'benchmark_deviation',
    'diversification_gap',
    'cost_basis_alert',
    'fee_impact',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly investmentsService: InvestmentsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async getInvestmentInsights(accountId: string, language?: string, userId?: string) {
    const now = new Date();

    // Check cache first (24h expiry)
    const cached = await this.prisma.generatedInsight.findMany({
      where: {
        accountId,
        isExpired: false,
        expiresAt: { gt: now },
        insightType: { in: InvestmentInsightsService.INSIGHT_TYPES },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached.length > 0) {
      return {
        insights: cached.map(this.mapInsightToResponse),
        generatedAt: cached[0].createdAt.toISOString(),
        portfolioSnapshotAt: cached[0].createdAt.toISOString(),
      };
    }

    // Generate new insights — tracking happens inside after successful OpenAI call
    return this.generateInsights(accountId, language, userId);
  }

  private async generateInsights(accountId: string, language?: string, userId?: string) {
    // Gather portfolio data
    const [summaryResult, analyticsResult, transactions] = await Promise.all([
      this.investmentsService.getPortfolioSummary(accountId),
      this.investmentsService.getPortfolioAnalytics(accountId, {
        period: 'month',
        benchmark: 'SPY',
      }),
      this.investmentsService.getTransactions(accountId),
    ]);

    const { summary } = summaryResult;
    const { performance, allocation, topGainers, topLosers } = analyticsResult;

    // Check if there's enough data to generate insights
    if (summary.holdings.length === 0) {
      return {
        insights: [],
        generatedAt: new Date().toISOString(),
        portfolioSnapshotAt: new Date().toISOString(),
      };
    }

    // Calculate additional metrics for the prompt
    const maxAllocation = Math.max(
      ...summary.holdings.map((h: typeof summary.holdings[number]) => h.allocationPercent),
    );
    const maxTypeAllocation = Math.max(
      ...allocation.map((a) => a.percentage),
    );
    const assetTypeCount = allocation.length;

    // Calculate total fees from transactions
    const totalFees = transactions.reduce(
      (sum: number, tx: typeof transactions[number]) => sum + Number(tx.fee || 0),
      0,
    );
    const feePercentage =
      summary.totalInvested > 0
        ? (totalFees / summary.totalInvested) * 100
        : 0;

    // Calculate benchmark comparison
    let portfolioReturn = 0;
    let benchmarkReturn = 0;
    if (performance.values.length >= 2) {
      const startValue = performance.values[0];
      const endValue = performance.values[performance.values.length - 1];
      portfolioReturn =
        startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;
    }
    if (performance.benchmarkValues && performance.benchmarkValues.length > 0) {
      benchmarkReturn =
        performance.benchmarkValues[performance.benchmarkValues.length - 1];
    }

    // Build the prompt
    const languageName =
      InvestmentInsightsService.LANGUAGE_NAMES[language || 'en'] || 'English';

    const holdingsData = summary.holdings.map((h: typeof summary.holdings[number]) => ({
      symbol: h.symbol,
      name: h.name,
      type: h.assetType,
      quantity: h.quantity,
      avgCost: h.averageCostBasis,
      currentPrice: h.currentPrice,
      marketValue: h.marketValue,
      invested: h.totalInvested,
      pnl: h.pnl,
      pnlPercent: h.pnlPercent,
      allocation: h.allocationPercent,
    }));

    const prompt = `You are an investment portfolio analyst. Analyze this portfolio data and identify 3-5 meaningful investment insights.

IMPORTANT: Write ALL content in ${languageName}. This includes titles, descriptions, action suggestions, chart labels, and metric names. Everything the user will see must be in ${languageName}.

Portfolio Summary:
- Total Portfolio Value: ${summary.totalValue.toFixed(2)} USD
- Total Invested: ${summary.totalInvested.toFixed(2)} USD
- Overall P&L: ${summary.totalPnL.toFixed(2)} (${summary.totalPnLPercent.toFixed(2)}%)
- Holdings Count: ${summary.holdings.length}

Holdings Data:
${JSON.stringify(holdingsData, null, 2)}

Allocation by Asset Type:
${JSON.stringify(allocation, null, 2)}

Portfolio Metrics:
- Max Single Asset Allocation: ${maxAllocation.toFixed(1)}%
- Max Asset Type Allocation: ${maxTypeAllocation.toFixed(1)}%
- Number of Asset Types: ${assetTypeCount}
- Total Fees Paid: ${totalFees.toFixed(2)} (${feePercentage.toFixed(2)}% of invested)
- Portfolio Return (1M): ${portfolioReturn.toFixed(2)}%
- Benchmark (SPY) Return (1M): ${benchmarkReturn.toFixed(2)}%

Top Gainers: ${JSON.stringify(topGainers)}
Top Losers: ${JSON.stringify(topLosers)}

For each insight, return a JSON object with:
- insightType: one of ${JSON.stringify(InvestmentInsightsService.INSIGHT_TYPES)}
- title: short headline (max 60 chars)
- description: 1-2 sentence explanation with specific data from the portfolio
- severity: "info" | "warning" | "critical"
- chartConfig: { chartType: "bar"|"donut"|"line"|"grouped_bar", title: string, data: [{label: string, value: number, color?: string}] }
- actionSuggestion: specific actionable advice (1-2 sentences)

Severity Guidelines:
- critical: Concentration >40% single asset, position down >30%, severe imbalance (>70% one type)
- warning: Concentration 25-40%, position down 15-30%, moderate imbalance (50-70%)
- info: Opportunities, positive trends, educational insights, diversification suggestions

Chart Type Guidelines:
- concentration_risk: use "donut" showing allocation percentages
- sector_imbalance: use "bar" showing allocation by asset type
- underperformer/overperformer: use "bar" showing P&L percentages
- benchmark_deviation: use "grouped_bar" comparing portfolio vs benchmark
- diversification_gap: use "donut" showing current allocation
- cost_basis_alert: use "bar" showing unrealized P&L
- fee_impact: use "donut" showing fees vs net investment

Return ONLY a valid JSON object with an "insights" array. No markdown, no code blocks.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      });

      // Track AI usage only after successful OpenAI call
      if (userId) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
        const adjustedCost = 2.5 * getAiCostMultiplier(u?.aiModel ?? undefined);
        await this.subscriptionsService.trackAiUsage(userId, 'investment_insights', adjustedCost, accountId);
      }

      const responseText =
        completion.choices[0]?.message?.content || '{"insights":[]}';
      let parsedInsights: any[];

      try {
        const parsed = JSON.parse(responseText);
        parsedInsights = Array.isArray(parsed)
          ? parsed
          : parsed.insights || [];
      } catch {
        this.logger.warn('Failed to parse investment AI insights response');
        parsedInsights = [];
      }

      // Save to database
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      const now = new Date();
      const savedInsights = [];

      for (const insight of parsedInsights.slice(0, 5)) {
        try {
          // Validate insight type
          const insightType = InvestmentInsightsService.INSIGHT_TYPES.includes(
            insight.insightType,
          )
            ? insight.insightType
            : 'concentration_risk';

          const saved = await this.prisma.generatedInsight.create({
            data: {
              accountId,
              insightType,
              title: insight.title || 'Investment Insight',
              description: insight.description || '',
              severity: insight.severity || 'info',
              chartConfig: insight.chartConfig || {
                chartType: 'bar',
                title: '',
                data: [],
              },
              actionSuggestion: insight.actionSuggestion,
              periodStart: now,
              periodEnd: now,
              expiresAt,
            },
          });
          savedInsights.push(saved);
        } catch (e) {
          this.logger.warn(`Failed to save investment insight: ${e}`);
        }
      }

      return {
        insights: savedInsights.map(this.mapInsightToResponse),
        generatedAt: now.toISOString(),
        portfolioSnapshotAt: now.toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to generate investment AI insights: ${error}`);
      return {
        insights: [],
        generatedAt: new Date().toISOString(),
        portfolioSnapshotAt: new Date().toISOString(),
      };
    }
  }

  private mapInsightToResponse(insight: any) {
    return {
      id: insight.id,
      insightType: insight.insightType,
      title: insight.title,
      description: insight.description,
      severity: insight.severity,
      chartConfig: insight.chartConfig,
      actionSuggestion: insight.actionSuggestion,
      generatedAt:
        insight.createdAt?.toISOString?.() || new Date().toISOString(),
    };
  }
}
