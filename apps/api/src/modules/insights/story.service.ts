import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';

@Injectable()
export class StoryService {
  private readonly logger = new Logger(StoryService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly budgetsService: BudgetsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async getSpendingStory(
    accountId: string,
    period: 'week' | 'month',
    forceRegenerate = false,
    language?: string,
  ) {
    const now = new Date();
    const { periodStart, periodEnd, periodLabel } = this.computePeriod(now, period, language);

    // Check cache unless force regenerate
    if (!forceRegenerate) {
      const cached = await this.prisma.spendingStory.findUnique({
        where: {
          accountId_periodStart_periodEnd: {
            accountId,
            periodStart,
            periodEnd,
          },
        },
      });

      if (cached && cached.expiresAt > now) {
        return {
          story: {
            id: cached.id,
            accountId: cached.accountId,
            periodLabel: cached.periodLabel,
            periodStart: cached.periodStart.toISOString(),
            periodEnd: cached.periodEnd.toISOString(),
            blocks: cached.blocks as any[],
            summary: cached.summary,
            generatedAt: cached.createdAt.toISOString(),
          },
          isStale: false,
        };
      }
    }

    return this.generateStory(accountId, periodStart, periodEnd, periodLabel, language);
  }

  private static readonly LOCALE_MAP: Record<string, string> = {
    en: 'en-US',
    ru: 'ru-RU',
    ua: 'uk-UA',
    de: 'de-DE',
    es: 'es-ES',
    fr: 'fr-FR',
    pl: 'pl-PL',
  };

  private computePeriod(now: Date, period: 'week' | 'month', language?: string) {
    const locale = StoryService.LOCALE_MAP[language || 'en'] || 'en-US';

    if (period === 'month') {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthName = now.toLocaleDateString(locale, { month: 'long' });
      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      const periodLabel = `${capitalizedMonth} ${now.getFullYear()}`;
      return { periodStart, periodEnd, periodLabel };
    }

    // Week: Monday to Sunday
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const periodLabel = monday.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    return { periodStart: monday, periodEnd: sunday, periodLabel };
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

  private async generateStory(
    accountId: string,
    periodStart: Date,
    periodEnd: Date,
    periodLabel: string,
    language?: string,
  ) {
    // Gather comprehensive data
    const previousPeriodStart = new Date(periodStart);
    previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);

    const [
      currentExpenses,
      previousExpenses,
      incomes,
      budgets,
    ] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: periodStart, lte: periodEnd } },
        include: { category: true },
        orderBy: { amount: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: previousPeriodStart, lt: periodStart } },
        include: { category: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, date: { gte: periodStart, lte: periodEnd } },
      }),
      this.prisma.budget.findMany({
        where: { accountId, isActive: true, isDeleted: false },
      }),
    ]);

    // Compute aggregates
    const totalExpenses = currentExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalPrevExpenses = previousExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalIncome = incomes.reduce((s, i) => s + Number(i.amount), 0);
    const netSavings = totalIncome - totalExpenses;

    const byCategory = new Map<string, { name: string; amount: number; count: number; color?: string }>();
    for (const e of currentExpenses) {
      const catId = e.categoryId || 'uncategorized';
      const catName = e.category?.name || 'Uncategorized';
      const cur = byCategory.get(catId) || { name: catName, amount: 0, count: 0, color: e.category?.color || undefined };
      byCategory.set(catId, {
        name: catName,
        amount: cur.amount + Number(e.amount),
        count: cur.count + 1,
        color: cur.color,
      });
    }

    const categoryBreakdown = Array.from(byCategory.entries())
      .map(([id, d]) => ({ categoryId: id, name: d.name, amount: Math.round(d.amount * 100) / 100, count: d.count }))
      .sort((a, b) => b.amount - a.amount);

    const dailyTotals: Array<{ date: string; amount: number }> = [];
    const dailyMap = new Map<string, number>();
    for (const e of currentExpenses) {
      const dk = e.date.toISOString().split('T')[0];
      dailyMap.set(dk, (dailyMap.get(dk) || 0) + Number(e.amount));
    }
    for (const [date, amount] of Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      dailyTotals.push({ date, amount: Math.round(amount * 100) / 100 });
    }

    const topExpenses = currentExpenses.slice(0, 5).map((e) => ({
      description: e.description || 'Expense',
      amount: Number(e.amount),
      category: e.category?.name || 'Uncategorized',
      date: e.date.toISOString().split('T')[0],
    }));

    const budgetData = [];
    for (const b of budgets) {
      try {
        const progress = await this.budgetsService.getProgress(accountId, b.id);
        budgetData.push({
          name: b.name,
          limit: Number(b.amount),
          spent: progress.spent,
          percentUsed: progress.percentageUsed,
        });
      } catch {
        // skip
      }
    }

    const changeVsPrev = totalPrevExpenses > 0
      ? Math.round(((totalExpenses - totalPrevExpenses) / totalPrevExpenses) * 100)
      : 0;

    const currencyCode = currentExpenses[0]?.currencyCode || budgets[0]?.currencyCode || 'USD';

    // Build GPT prompt
    const languageName = StoryService.LANGUAGE_NAMES[language || 'en'] || 'English';

    const prompt = `You are a personal finance storyteller. Create a narrative spending story for the period "${periodLabel}".

IMPORTANT: Write ALL content in ${languageName}. This includes titles, descriptions, narrative text, metric labels, chart labels, achievement texts, callout texts, and the summary. Everything the user will see must be in ${languageName}.

Data:
- Currency: ${currencyCode}
- Total spent: ${totalExpenses.toFixed(2)}
- Total income: ${totalIncome.toFixed(2)}
- Net savings: ${netSavings.toFixed(2)}
- Change vs previous period: ${changeVsPrev}%
- Categories: ${JSON.stringify(categoryBreakdown.slice(0, 8))}
- Daily spending: ${JSON.stringify(dailyTotals)}
- Top expenses: ${JSON.stringify(topExpenses)}
- Budgets: ${JSON.stringify(budgetData)}

Create 6-10 story blocks. Each block has:
- type: one of "hero_metric", "narrative_text", "chart", "comparison", "callout", "achievement"
- order: sequential number starting at 1
- content: object with relevant fields

Block types:
1. hero_metric: { title, metrics: [{label, value, change}], tone }
2. narrative_text: { text, tone } - write engaging, friendly text like talking to a friend
3. chart: { title, chartConfig: {chartType: "bar"|"donut"|"line", title, data: [{label, value, color}]} }
4. comparison: { title, metrics: [{label, value, change}] }
5. callout: { title, text, icon, tone }
6. achievement: { title, text, icon, tone: "celebration" }

Tone values: "positive" | "neutral" | "warning" | "celebration"
Icons: use emoji strings like "🎯", "💰", "📊", "⚠️", "🏆", "💡"

Also provide a one-sentence summary.

Rules:
- Start with a hero_metric showing total spent
- Include at least one chart block
- Include achievements for good metrics (under budget, saving money, etc.)
- Include callouts for warnings (overspending, anomalies)
- Use real numbers from the data, do NOT fabricate
- Make the narrative personal and encouraging

Return ONLY valid JSON: { "blocks": [...], "summary": "..." }`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{"blocks":[],"summary":""}';
      let parsed: { blocks: any[]; summary: string };

      try {
        parsed = JSON.parse(responseText);
        if (!parsed.blocks) parsed = { blocks: [], summary: '' };
      } catch {
        this.logger.warn('Failed to parse story response');
        parsed = { blocks: [], summary: '' };
      }

      // Save to database
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const saved = await this.prisma.spendingStory.upsert({
        where: {
          accountId_periodStart_periodEnd: {
            accountId,
            periodStart,
            periodEnd,
          },
        },
        create: {
          accountId,
          periodLabel,
          periodStart,
          periodEnd,
          blocks: parsed.blocks,
          summary: parsed.summary || '',
          expiresAt,
        },
        update: {
          blocks: parsed.blocks,
          summary: parsed.summary || '',
          periodLabel,
          expiresAt,
          createdAt: new Date(),
        },
      });

      return {
        story: {
          id: saved.id,
          accountId: saved.accountId,
          periodLabel: saved.periodLabel,
          periodStart: saved.periodStart.toISOString(),
          periodEnd: saved.periodEnd.toISOString(),
          blocks: saved.blocks as any[],
          summary: saved.summary,
          generatedAt: saved.createdAt.toISOString(),
        },
        isStale: false,
      };
    } catch (error) {
      this.logger.error(`Failed to generate story: ${error}`);
      return {
        story: {
          id: '',
          accountId,
          periodLabel,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          blocks: [],
          summary: 'Unable to generate story at this time.',
          generatedAt: new Date().toISOString(),
        },
        isStale: true,
      };
    }
  }
}
