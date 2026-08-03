import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { getResponseModeInstruction, AiResponseMode } from '../ai/services/response-mode.helper';
import { getAiCostMultiplier } from '../ai/services/model-resolver';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { getRatesSafe, convertAmount } from '../../common/utils/fx';

/** Mirrors FatFinderResponse in @budget/shared-types (which the API cannot import at runtime). */
export interface FatFinderReportResult {
  report: {
    id: string;
    accountId: string;
    periodStart: string;
    periodEnd: string;
    findings: any[];
    totalPotentialSavings: number;
    currencyCode: string;
    generatedAt: string;
  };
  isStale: boolean;
  encryptionRestricted?: boolean;
  fxConverted?: boolean;
  fxApproximate?: boolean;
}

@Injectable()
export class FatFinderService {
  private readonly logger = new Logger(FatFinderService.name);
  private readonly openai: OpenAI;

  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    ru: 'Russian',
    ua: 'Ukrainian',
    de: 'German',
    es: 'Spanish',
    fr: 'French',
    pl: 'Polish',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }


  private async getEncryptionTier(accountId: string): Promise<number> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    return account?.encryptionTier ?? 0;
  }

  /**
   * `baseCurrency` is the caller's display currency (user.currencyCode) — the report is
   * labelled AND computed in it, with every expense FX-converted first. It must never be
   * inferred from a single expense row: an account with 226 PLN charges and one 5 USD
   * charge would otherwise be audited "in dollars" with the amounts summed blind (ABA-386).
   */
  async generateReport(
    accountId: string,
    language?: string,
    forceRegenerate = false,
    userId?: string,
    month?: number,
    year?: number,
    baseCurrency = 'USD',
  ): Promise<FatFinderReportResult> {
    const encryptionTier = await this.getEncryptionTier(accountId);
    if (encryptionTier >= 2) {
      return {
        encryptionRestricted: true,
        report: {
          id: '',
          accountId,
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          findings: [],
          totalPotentialSavings: 0,
          currencyCode: baseCurrency,
          generatedAt: new Date().toISOString(),
        },
        isStale: false,
      };
    }

    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month != null ? month - 1 : now.getMonth(); // month param is 1-based
    const currentMonthStart = new Date(targetYear, targetMonth, 1);
    const currentMonthEnd = new Date(targetYear, targetMonth + 1, 0);

    // Check cache (30-day expiry)
    if (!forceRegenerate) {
      const cached = await this.prisma.fatFinderReport.findUnique({
        where: {
          accountId_periodStart_periodEnd: {
            accountId,
            periodStart: currentMonthStart,
            periodEnd: currentMonthEnd,
          },
        },
      });

      // A report cached under a different display currency must be regenerated, not
      // served — otherwise the caller reads someone else's currency label (ABA-386).
      if (cached && cached.expiresAt > now && cached.currencyCode === baseCurrency) {
        return {
          report: this.mapReport(cached),
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

    // Gather 3 months of expenses
    const threeMonthsAgo = new Date(targetYear, targetMonth - 3, 1);

    const expenses = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, date: { gte: threeMonthsAgo, lte: currentMonthEnd } },
      include: { category: true, expenseTags: { include: { tag: true } } },
      orderBy: { date: 'desc' },
    });

    const emptyReport = (fxApproximate: boolean) => ({
      report: {
        id: '',
        accountId,
        periodStart: currentMonthStart.toISOString(),
        periodEnd: currentMonthEnd.toISOString(),
        findings: [],
        totalPotentialSavings: 0,
        currencyCode: baseCurrency,
        generatedAt: now.toISOString(),
      },
      isStale: false,
      fxApproximate,
    });

    if (expenses.length === 0) {
      return emptyReport(false);
    }

    // Normalize every amount into the display currency BEFORE any aggregation — the
    // account may mix PLN/EUR/USD and the LLM only ever sees one currency label.
    const needsFx = expenses.some(e => e.currencyCode !== baseCurrency);
    const rates = needsFx ? await getRatesSafe(this.exchangeRateService, baseCurrency) : null;
    let fxApproximate = false;
    let fxConverted = false;

    const analysis: { description: string; amount: number; date: Date; category: string }[] = [];
    for (const e of expenses) {
      const native = Number(e.amount);
      const converted = convertAmount(native, e.currencyCode, baseCurrency, rates);
      if (converted === null) {
        // Unknown rate: exclude rather than mislabel it (wrapped/safe-to-spend convention).
        fxApproximate = true;
        continue;
      }
      if (e.currencyCode !== baseCurrency) fxConverted = true;
      analysis.push({
        description: e.description || 'Expense',
        amount: converted,
        date: e.date,
        category: (e as any).category?.name || 'Uncategorized',
      });
    }

    if (analysis.length === 0) {
      return emptyReport(fxApproximate);
    }

    // Pre-detect patterns
    const currentMonthExpenses = analysis.filter(e => e.date >= currentMonthStart);
    const previousExpenses = analysis.filter(e => e.date < currentMonthStart);
    const currencyCode = baseCurrency;

    // Detect possible subscriptions: same description recurring monthly
    const descriptionCounts = new Map<string, { count: number; amounts: number[]; dates: Date[] }>();
    for (const e of analysis) {
      const key = e.description.toLowerCase().trim();
      if (!key) continue;
      const existing = descriptionCounts.get(key) || { count: 0, amounts: [], dates: [] };
      existing.count++;
      existing.amounts.push(e.amount);
      existing.dates.push(e.date);
      descriptionCounts.set(key, existing);
    }

    const possibleSubscriptions = Array.from(descriptionCounts.entries())
      .filter(([, data]) => {
        if (data.count < 2) return false;
        const amounts = data.amounts;
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const isConsistentAmount = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.15);
        return isConsistentAmount;
      })
      .map(([desc, data]) => ({
        description: desc,
        avgAmount: data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length,
        count: data.count,
      }))
      .slice(0, 10);

    // Detect large one-off expenses (> 2x average transaction)
    const avgTransaction = analysis.reduce((sum, e) => sum + e.amount, 0) / analysis.length;
    const largeExpenses = currentMonthExpenses
      .filter(e => e.amount > avgTransaction * 2)
      .map(e => ({
        description: e.description,
        amount: e.amount,
        date: e.date.toISOString().split('T')[0],
        category: e.category,
      }))
      .slice(0, 10);

    // Category trends (month-over-month)
    const monthsOfPrevData = Math.max(1, Math.ceil((currentMonthStart.getTime() - threeMonthsAgo.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const prevCategoryTotals = new Map<string, number>();
    for (const e of previousExpenses) {
      prevCategoryTotals.set(e.category, (prevCategoryTotals.get(e.category) || 0) + e.amount);
    }
    const currCategoryTotals = new Map<string, number>();
    for (const e of currentMonthExpenses) {
      currCategoryTotals.set(e.category, (currCategoryTotals.get(e.category) || 0) + e.amount);
    }

    const categoryTrends = Array.from(currCategoryTotals.entries())
      .map(([name, current]) => {
        const prevAvg = (prevCategoryTotals.get(name) || 0) / monthsOfPrevData;
        const change = prevAvg > 0 ? ((current - prevAvg) / prevAvg) * 100 : 0;
        return { name, current: Math.round(current * 100) / 100, prevMonthlyAvg: Math.round(prevAvg * 100) / 100, changePercent: Math.round(change) };
      })
      .sort((a, b) => b.changePercent - a.changePercent);

    // Build grouped expenses by category
    const expensesByCategory = new Map<string, { description: string; amount: number; date: string }[]>();
    for (const e of currentMonthExpenses) {
      const items = expensesByCategory.get(e.category) || [];
      items.push({ description: e.description, amount: e.amount, date: e.date.toISOString().split('T')[0] });
      expensesByCategory.set(e.category, items);
    }

    const totalCurrentMonth = currentMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const avgMonthly = analysis.reduce((s, e) => s + e.amount, 0) / Math.max(1, Math.ceil((now.getTime() - threeMonthsAgo.getTime()) / (30 * 24 * 60 * 60 * 1000)));

    const languageName = FatFinderService.LANGUAGE_NAMES[language || 'en'] || 'English';
    const responseModeInstruction = getResponseModeInstruction(responseMode);

    const encryptionNotice = encryptionTier >= 1
      ? '\nNOTE: This account has text-level encryption. Expense descriptions are encrypted. Focus on amounts and categories only.\n'
      : '';

    const currencyNotice = [
      `IMPORTANT: EVERY amount below is already expressed in ${currencyCode}. Write every amount you output in ${currencyCode} too — never relabel it as another currency and never use a currency symbol that does not belong to ${currencyCode}.`,
      fxConverted
        ? `Amounts originally recorded in other currencies were converted into ${currencyCode} at today's rate — note once that converted figures are approximate.`
        : '',
      fxApproximate
        ? 'A few expenses were left out because no exchange rate was available for their currency — note once that the audit may be incomplete.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a personal finance advisor doing a monthly spending audit.
${encryptionNotice}
${responseModeInstruction}

IMPORTANT: Write ALL content in ${languageName}.
${currencyNotice}

Analysis period: ${currentMonthStart.toISOString().split('T')[0]} to ${currentMonthEnd.toISOString().split('T')[0]}
Total spent this month: ${totalCurrentMonth.toFixed(2)} ${currencyCode}
Average monthly (last 3mo): ${avgMonthly.toFixed(2)} ${currencyCode}

Detected patterns:
- Possible subscriptions: ${JSON.stringify(possibleSubscriptions)}
- Large expenses (>2x avg): ${JSON.stringify(largeExpenses)}
- Category trends: ${JSON.stringify(categoryTrends.slice(0, 8))}

Full expense list (grouped by category, current month only):
${JSON.stringify(Object.fromEntries(expensesByCategory))}

Find 3-7 opportunities to save money. For each finding:
1. type: "subscription" | "recurring_splurge" | "large_one_off" | "category_excess" | "service_overuse"
2. title: short headline (max 60 chars)
3. description: 1-2 sentences with specific amounts
4. currentMonthly: what user currently spends per month
5. suggestedMonthly: recommended amount
6. potentialSavings: currentMonthly - suggestedMonthly
7. severity: "low" (<5% of total) | "medium" (5-10%) | "high" (>10%)
8. actionSuggestion: 1 actionable sentence
9. relatedExpenses: up to 5 items with {description, amount, date}

Return ONLY valid JSON: { "findings": [...], "totalPotentialSavings": number }`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      // Track AI usage only after successful OpenAI call
      if (userId) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
        const adjustedCost = 3.0 * getAiCostMultiplier(u?.aiModel ?? undefined);
        await this.subscriptionsService.trackAiUsage(userId, 'fat_finder', adjustedCost, accountId);
      }

      const responseText = completion.choices[0]?.message?.content || '{"findings":[],"totalPotentialSavings":0}';
      let parsed: any;

      try {
        parsed = JSON.parse(responseText);
      } catch {
        this.logger.warn('Failed to parse fat finder response');
        parsed = { findings: [], totalPotentialSavings: 0 };
      }

      const findings = (parsed.findings || []).slice(0, 7).map((f: any, i: number) => ({
        id: `ff-${Date.now()}-${i}`,
        ...f,
      }));

      const totalPotentialSavings = parsed.totalPotentialSavings || findings.reduce((s: number, f: any) => s + (f.potentialSavings || 0), 0);

      // Save to database
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const saved = await this.prisma.fatFinderReport.upsert({
        where: {
          accountId_periodStart_periodEnd: {
            accountId,
            periodStart: currentMonthStart,
            periodEnd: currentMonthEnd,
          },
        },
        update: {
          findings: findings,
          totalSavings: totalPotentialSavings,
          currencyCode,
          expiresAt,
        },
        create: {
          accountId,
          periodStart: currentMonthStart,
          periodEnd: currentMonthEnd,
          findings: findings,
          totalSavings: totalPotentialSavings,
          currencyCode,
          expiresAt,
        },
      });

      return {
        report: this.mapReport(saved),
        isStale: false,
        fxConverted,
        fxApproximate,
      };
    } catch (error) {
      this.logger.error(`Failed to generate fat finder report: ${error}`);
      return {
        report: {
          id: '',
          accountId,
          periodStart: currentMonthStart.toISOString(),
          periodEnd: currentMonthEnd.toISOString(),
          findings: [],
          totalPotentialSavings: 0,
          currencyCode,
          generatedAt: now.toISOString(),
        },
        isStale: false,
        fxConverted,
        fxApproximate,
      };
    }
  }

  private mapReport(report: any) {
    return {
      id: report.id,
      accountId: report.accountId,
      periodStart: report.periodStart?.toISOString?.() || report.periodStart,
      periodEnd: report.periodEnd?.toISOString?.() || report.periodEnd,
      findings: report.findings || [],
      totalPotentialSavings: Number(report.totalSavings),
      currencyCode: report.currencyCode,
      generatedAt: report.createdAt?.toISOString?.() || new Date().toISOString(),
    };
  }
}
