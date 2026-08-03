import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { translateUncategorized, localizeStoryBlocks } from '../../common/utils/translate';
import { getResponseModeInstruction, AiResponseMode } from '../ai/services/response-mode.helper';
import { getAiCostMultiplier } from '../ai/services/model-resolver';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { getRatesSafe, convertAmount } from '../../common/utils/fx';

/** Mirrors SpendingStoryResponse in @budget/shared-types (not importable at runtime). */
export interface SpendingStoryResult {
  story: {
    id: string;
    accountId: string;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    blocks: any[];
    summary: string;
    generatedAt: string;
  };
  isStale: boolean;
  encryptionRestricted?: boolean;
  fxConverted?: boolean;
  fxApproximate?: boolean;
}

@Injectable()
export class StoryService {
  private readonly logger = new Logger(StoryService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly budgetsService: BudgetsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Get the encryption tier for an account (0=off, 1=text, 2=full).
   */
  private async getEncryptionTier(accountId: string): Promise<number> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    return account?.encryptionTier ?? 0;
  }

  /**
   * `baseCurrency` is the caller's display currency (user.currencyCode) — the story is
   * narrated AND computed in it, with every amount FX-converted first. It must never be
   * inferred from a single expense row (ABA-386/387): the expense query is ordered by
   * amount desc, so one large charge in another currency used to relabel the whole story
   * while amounts of every currency were summed under that one label.
   */
  async getSpendingStory(
    accountId: string,
    period: 'week' | 'month',
    forceRegenerate = false,
    language?: string,
    userId?: string,
    month?: number,
    year?: number,
    baseCurrency = 'USD',
  ): Promise<SpendingStoryResult> {
    // Tier 2 (full encryption): amounts are encrypted, stories cannot be generated
    const encryptionTier = await this.getEncryptionTier(accountId);
    if (encryptionTier >= 2) {
      return {
        encryptionRestricted: true,
        story: {
          id: '',
          accountId,
          periodLabel: '',
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          blocks: [],
          summary: 'Spending story is unavailable because this account uses full end-to-end encryption.',
          generatedAt: new Date().toISOString(),
        },
        isStale: false,
      };
    }

    const now = new Date();
    const targetDate = (month != null && year != null)
      ? new Date(year, month - 1, 15) // mid-month to avoid timezone edge cases
      : now;
    const { periodStart, periodEnd, periodLabel } = this.computePeriod(targetDate, period, language);

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

      // A story cached under a different display currency must be regenerated, not
      // served — its narrated amounts are in that other currency (ABA-387). Rows
      // written before the column existed carry null and are regenerated once.
      if (
        cached &&
        cached.expiresAt > now &&
        cached.periodLabel === periodLabel &&
        cached.currencyCode === baseCurrency
      ) {
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

    // Fetch response mode
    let responseMode: AiResponseMode = 'balanced';
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiResponseMode: true } });
      responseMode = (user?.aiResponseMode as AiResponseMode) || 'balanced';
    }

    return this.generateStory(accountId, periodStart, periodEnd, periodLabel, language, encryptionTier, responseMode, userId, baseCurrency);
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
    encryptionTier = 0,
    responseMode: AiResponseMode = 'balanced',
    userId?: string,
    baseCurrency = 'USD',
  ): Promise<SpendingStoryResult> {
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

    // Normalize every amount into the display currency BEFORE aggregating: the account
    // may mix PLN/EUR/USD and the narrative only ever names one currency (ABA-387).
    // An amount with no known rate is excluded rather than mislabelled, and flags the
    // story as approximate (wrapped/safe-to-spend convention).
    const currencyCode = baseCurrency;
    const needsFx =
      currentExpenses.some((e) => e.currencyCode !== baseCurrency) ||
      previousExpenses.some((e) => e.currencyCode !== baseCurrency) ||
      incomes.some((i) => i.currencyCode !== baseCurrency) ||
      budgets.some((b) => b.currencyCode !== baseCurrency);
    const rates = needsFx ? await getRatesSafe(this.exchangeRateService, baseCurrency) : null;
    let fxApproximate = false;
    let fxConverted = false;

    const toBase = (amount: number, from: string): number | null => {
      const converted = convertAmount(amount, from, baseCurrency, rates);
      if (converted === null) {
        fxApproximate = true;
        return null;
      }
      if (from !== baseCurrency) fxConverted = true;
      return converted;
    };

    // Compute aggregates
    type ExpenseWithCategory = typeof currentExpenses[number];
    type IncomeRecord = typeof incomes[number];

    const currentConverted: { row: ExpenseWithCategory; amount: number }[] = [];
    for (const e of currentExpenses) {
      const amount = toBase(Number(e.amount), e.currencyCode);
      if (amount !== null) currentConverted.push({ row: e, amount });
    }
    // Re-sort: the query orders by native amount, which is meaningless once mixed
    // currencies are normalized (10 USD outranks 100 PLN only after conversion).
    currentConverted.sort((a, b) => b.amount - a.amount);

    const totalExpenses = currentConverted.reduce((s: number, e) => s + e.amount, 0);
    const totalPrevExpenses = previousExpenses.reduce((s: number, e: ExpenseWithCategory) => {
      const amount = toBase(Number(e.amount), e.currencyCode);
      return amount === null ? s : s + amount;
    }, 0);
    const totalIncome = incomes.reduce((s: number, i: IncomeRecord) => {
      const amount = toBase(Number(i.amount), i.currencyCode);
      return amount === null ? s : s + amount;
    }, 0);
    const netSavings = totalIncome - totalExpenses;

    const byCategory = new Map<string, { name: string; amount: number; count: number; color?: string }>();
    for (const { row: e, amount } of currentConverted) {
      const catId = e.categoryId || 'uncategorized';
      const catName = e.category?.name || translateUncategorized(language);
      const cur = byCategory.get(catId) || { name: catName, amount: 0, count: 0, color: e.category?.color || undefined };
      byCategory.set(catId, {
        name: catName,
        amount: cur.amount + amount,
        count: cur.count + 1,
        color: cur.color,
      });
    }

    const categoryBreakdown = Array.from(byCategory.entries())
      .map(([id, d]) => ({ categoryId: id, name: d.name, amount: Math.round(d.amount * 100) / 100, count: d.count }))
      .sort((a, b) => b.amount - a.amount);

    const dailyTotals: Array<{ date: string; amount: number }> = [];
    const dailyMap = new Map<string, number>();
    for (const { row: e, amount } of currentConverted) {
      const dk = e.date.toISOString().split('T')[0];
      dailyMap.set(dk, (dailyMap.get(dk) || 0) + amount);
    }
    for (const [date, amount] of Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      dailyTotals.push({ date, amount: Math.round(amount * 100) / 100 });
    }

    const topExpenses = currentConverted.slice(0, 5).map(({ row: e, amount }) => ({
      description: encryptionTier >= 1 ? 'Expense' : (e.description || 'Expense'),
      amount,
      category: e.category?.name || translateUncategorized(language),
      date: e.date.toISOString().split('T')[0],
    }));

    // Resolve once per account (not per budget) so the story's budget figures
    // agree with what GET /budgets/:id/progress reports for an anchored
    // account — same reasoning as the AI chat tool dispatcher.
    const anchorDay = await this.budgetsService.getAccountAnchorDay(accountId);

    const budgetData = [];
    for (const b of budgets) {
      try {
        const progress = await this.budgetsService.getProgress(accountId, b.id, anchorDay);
        // getProgress reports in the BUDGET's currency (it filters expenses by it),
        // so both figures need converting; percentUsed is a ratio and needs none.
        const limit = toBase(Number(b.amount), b.currencyCode);
        const spent = toBase(progress.spent, b.currencyCode);
        if (limit === null || spent === null) continue;
        budgetData.push({
          name: b.name,
          limit,
          spent,
          percentUsed: progress.percentageUsed,
        });
      } catch {
        // skip
      }
    }

    const changeVsPrev = totalPrevExpenses > 0
      ? Math.round(((totalExpenses - totalPrevExpenses) / totalPrevExpenses) * 100)
      : 0;

    // Build GPT prompt
    const languageName = StoryService.LANGUAGE_NAMES[language || 'en'] || 'English';

    const encryptionNotice = encryptionTier >= 1
      ? '\nNOTE: This account has text-level encryption. Expense descriptions and notes are encrypted and unavailable. Focus the story on amounts, categories, and numerical trends only. Do not reference specific expense descriptions.\n'
      : '';

    const responseModeInstruction = getResponseModeInstruction(responseMode);

    const prompt = `You are a personal finance storyteller. Create a narrative spending story for the period "${periodLabel}".
${encryptionNotice}
${responseModeInstruction}

IMPORTANT: Write ALL content in ${languageName}. This includes titles, descriptions, narrative text, metric labels, chart data labels (like category names, axis labels, legend entries), achievement texts, callout texts, and the summary. Everything the user will see must be in ${languageName}. Do NOT use English words like "Total", "Other", "Uncategorized" — translate them to ${languageName}.

EVERY amount below is already expressed in ${currencyCode} — write every amount in ${currencyCode}, never relabel it as another currency and never use a currency symbol that does not belong to ${currencyCode}.${
      fxConverted
        ? `\nAmounts originally recorded in other currencies were converted into ${currencyCode} at today's rate — mention once that converted figures are approximate.`
        : ''
    }${
      fxApproximate
        ? '\nA few amounts were left out because no exchange rate was available for their currency — mention once that the picture may be incomplete.'
        : ''
    }

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
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      // Track AI usage only after successful OpenAI call
      if (userId) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
        const adjustedCost = 3.0 * getAiCostMultiplier(u?.aiModel ?? undefined);
        await this.subscriptionsService.trackAiUsage(userId, 'story', adjustedCost, accountId);
      }

      const responseText = completion.choices[0]?.message?.content || '{"blocks":[],"summary":""}';
      let parsed: { blocks: any[]; summary: string };

      try {
        parsed = JSON.parse(responseText);
        if (!parsed.blocks) parsed = { blocks: [], summary: '' };
      } catch {
        this.logger.warn('Failed to parse story response');
        parsed = { blocks: [], summary: '' };
      }

      // Post-process: replace any remaining English labels GPT might have used
      parsed.blocks = localizeStoryBlocks(parsed.blocks, language);

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
          currencyCode,
          expiresAt,
        },
        update: {
          blocks: parsed.blocks,
          summary: parsed.summary || '',
          periodLabel,
          currencyCode,
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
        fxConverted,
        fxApproximate,
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
