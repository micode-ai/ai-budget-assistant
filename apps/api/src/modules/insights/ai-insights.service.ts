import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    ru: 'Russian',
    ua: 'Ukrainian',
    de: 'German',
    es: 'Spanish',
    fr: 'French',
    pl: 'Polish',
  };

  async getAIInsights(accountId: string, language?: string) {
    // Check cache first
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const cached = await this.prisma.generatedInsight.findMany({
      where: {
        accountId,
        isExpired: false,
        expiresAt: { gt: now },
        periodStart: currentMonthStart,
        periodEnd: currentMonthEnd,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached.length > 0) {
      return {
        insights: cached.map(this.mapInsightToResponse),
        generatedAt: cached[0].createdAt.toISOString(),
        periodStart: currentMonthStart.toISOString(),
        periodEnd: currentMonthEnd.toISOString(),
      };
    }

    // Generate new insights
    return this.generateInsights(accountId, currentMonthStart, currentMonthEnd, language);
  }

  private async generateInsights(accountId: string, periodStart: Date, periodEnd: Date, language?: string) {
    // Gather financial data
    const threeMonthsAgo = new Date(periodStart.getFullYear(), periodStart.getMonth() - 3, 1);

    const [currentExpenses, previousExpenses, budgets] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: periodStart, lte: periodEnd } },
        include: { category: true },
      }),
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: threeMonthsAgo, lt: periodStart } },
        include: { category: true },
      }),
      this.prisma.budget.findMany({
        where: { accountId, isActive: true, isDeleted: false },
      }),
    ]);

    // Aggregate data for the prompt
    const currentByCategory = new Map<string, { amount: number; name: string; count: number }>();
    const dailyTotals = new Map<string, number>();

    for (const expense of currentExpenses) {
      const catId = expense.categoryId || 'uncategorized';
      const catName = expense.category?.name || 'Uncategorized';
      const current = currentByCategory.get(catId) || { amount: 0, name: catName, count: 0 };
      currentByCategory.set(catId, {
        amount: current.amount + Number(expense.amount),
        name: catName,
        count: current.count + 1,
      });

      const dateKey = expense.date.toISOString().split('T')[0];
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + Number(expense.amount));
    }

    const prevByCategory = new Map<string, { total: number; months: Set<string> }>();
    for (const expense of previousExpenses) {
      const catId = expense.categoryId || 'uncategorized';
      const monthKey = `${expense.date.getFullYear()}-${expense.date.getMonth()}`;
      const current = prevByCategory.get(catId) || { total: 0, months: new Set<string>() };
      current.total += Number(expense.amount);
      current.months.add(monthKey);
      prevByCategory.set(catId, current);
    }

    const totalCurrentSpending = currentExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const categoryBreakdown = Array.from(currentByCategory.entries())
      .map(([id, data]) => {
        const prev = prevByCategory.get(id);
        const avgPrev = prev ? prev.total / Math.max(prev.months.size, 1) : 0;
        return {
          categoryId: id,
          name: data.name,
          currentAmount: data.amount,
          previousAvg: avgPrev,
          changePercent: avgPrev > 0 ? ((data.amount - avgPrev) / avgPrev) * 100 : 0,
          transactionCount: data.count,
        };
      })
      .sort((a, b) => b.currentAmount - a.currentAmount);

    const dailyData = Array.from(dailyTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

    const budgetData = budgets.map((b) => ({
      name: b.name,
      amount: Number(b.amount),
      period: b.period,
      currencyCode: b.currencyCode,
    }));

    // Call GPT-4
    const languageName = AiInsightsService.LANGUAGE_NAMES[language || 'en'] || 'English';

    const prompt = `You are a financial analyst. Analyze this spending data and identify 3-5 interesting patterns or insights.

IMPORTANT: Write ALL content in ${languageName}. This includes titles, descriptions, action suggestions, and chart labels. Everything the user will see must be in ${languageName}.

Current month spending data:
- Total: ${totalCurrentSpending.toFixed(2)}
- Categories: ${JSON.stringify(categoryBreakdown.slice(0, 10))}
- Daily spending: ${JSON.stringify(dailyData)}
- Active budgets: ${JSON.stringify(budgetData)}

For each insight, return a JSON object with:
- insightType: one of "anomaly_spike", "category_comparison", "trend_change", "budget_burndown", "savings_opportunity"
- title: short headline (max 60 chars)
- description: 1-2 sentence explanation
- severity: "info" | "warning" | "critical"
- chartConfig: { chartType: "bar"|"donut"|"line", title: string, data: [{label: string, value: number, color?: string}] }
- actionSuggestion: what the user should do (1 sentence)

Return ONLY a valid JSON array. No markdown, no code blocks.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{"insights":[]}';
      let parsedInsights: any[];

      try {
        const parsed = JSON.parse(responseText);
        parsedInsights = Array.isArray(parsed) ? parsed : (parsed.insights || []);
      } catch {
        this.logger.warn('Failed to parse AI insights response');
        parsedInsights = [];
      }

      // Save to database
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      const savedInsights = [];

      for (const insight of parsedInsights.slice(0, 5)) {
        try {
          const saved = await this.prisma.generatedInsight.create({
            data: {
              accountId,
              insightType: insight.insightType || 'trend_change',
              title: insight.title || 'Insight',
              description: insight.description || '',
              severity: insight.severity || 'info',
              chartConfig: insight.chartConfig || { chartType: 'bar', title: '', data: [] },
              actionSuggestion: insight.actionSuggestion,
              periodStart: periodStart,
              periodEnd: periodEnd,
              expiresAt,
            },
          });
          savedInsights.push(saved);
        } catch (e) {
          this.logger.warn(`Failed to save insight: ${e}`);
        }
      }

      return {
        insights: savedInsights.map(this.mapInsightToResponse),
        generatedAt: new Date().toISOString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to generate AI insights: ${error}`);
      return {
        insights: [],
        generatedAt: new Date().toISOString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
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
      generatedAt: insight.createdAt?.toISOString?.() || new Date().toISOString(),
    };
  }
}
