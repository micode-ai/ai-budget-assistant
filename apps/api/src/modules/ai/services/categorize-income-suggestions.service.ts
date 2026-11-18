import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  CategorizeCandidateIncome,
  CategorizeSuggestionGroup,
  CategorizeIncomeSuggestionsResponse,
} from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import { logCacheUsage } from '../utils/log-cache-usage';
import { buildCategorizeSuggestionsFormat } from './categorize-suggestions.service';
import {
  MAX_NEW_CATEGORIES,
  MIN_EXPENSES_PER_NEW_CATEGORY,
  LANGUAGE_NAMES,
  categorizeQuotaKey,
  categorizeResultKey,
  mergeOutcomeIntoGroups,
  resolveDailyLimit,
  sortedGroups,
  toModelOutcome,
  validateCategorization,
  type CategorizeModelOutcome as ModelOutcome,
} from '../utils/categorize-suggestions.util';

const MAX_CANDIDATES = 100;
const DAY_SECONDS = 24 * 60 * 60;
/**
 * How long a model answer is reused for the same candidates and categories.
 * Same rationale as the expense service: reopening the review must not spend
 * another daily pass or show a different answer for identical input.
 */
const RESULT_TTL_SECONDS = 30 * 60;

// Quota/cache keys, daily limit (the SAME env var and counter as the expense
// service — one shared account-level ceiling, see
// docs/contracts/categorize-uncategorized-incomes.md), language names and group
// assembly are shared via utils/categorize-suggestions.util.

/**
 * Proposes categories for an account's uncategorized incomes. READ-ONLY: it
 * writes nothing — the client creates categories and applies them only after
 * the user reviews, via PATCH /incomes/bulk. Mirrors
 * CategorizeSuggestionsService (expenses) but simpler: income has no
 * merchant field, so there is no rule pre-pass and no deterministic
 * merchant top-up — every candidate goes to the one batched model call.
 */
@Injectable()
export class CategorizeIncomeSuggestionsService {
  private readonly logger = new Logger(CategorizeIncomeSuggestionsService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async suggest(accountId: string): Promise<CategorizeIncomeSuggestionsResponse> {
    const baseWhere = {
      accountId,
      categoryId: null,
      isDeleted: false,
      isDebt: false,
      isDebtRepayment: false,
      // A transfer counted as income (ABA-604) is the user's own money moving
      // between their accounts — there is no income category it belongs to.
      linkedTransfer: { is: null },
    };
    const [rows, skippedEncrypted] = await Promise.all([
      this.prisma.income.findMany({
        where: { ...baseWhere, encryptedPayload: null },
        select: {
          id: true, clientId: true, description: true,
          amount: true, currencyCode: true, date: true, source: true,
        },
        orderBy: { date: 'desc' },
        take: MAX_CANDIDATES,
      }),
      this.prisma.income.count({ where: { ...baseWhere, encryptedPayload: { not: null } } }),
    ]);

    const incomes: CategorizeCandidateIncome[] = rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId ?? null,
      description: r.description ?? null,
      amount: Number(r.amount.toString()),
      currencyCode: r.currencyCode,
      date: r.date.toISOString().slice(0, 10),
      source: r.source,
    }));

    const limit = resolveDailyLimit(process.env.AI_CATEGORIZE_MAX_PER_DAY);
    const used = (await this.cache.get<number>(categorizeQuotaKey(accountId))) ?? 0;
    const empty: CategorizeIncomeSuggestionsResponse = {
      incomes, groups: [], unassigned: [], skippedEncrypted,
      remainingToday: Math.max(0, limit - used), limitReached: false,
    };
    if (rows.length === 0) {
      this.logger.log(`[CategorizeIncome] no_candidates account=${accountId}`);
      return empty;
    }

    const categories = await this.prisma.category.findMany({
      where: { accountId, type: 'income', isDeleted: false },
      select: { id: true, name: true },
    });
    const validIds = new Set(categories.map((c: { id: string }) => c.id));

    const finish = (
      outcome: ModelOutcome | null,
      extra: Partial<CategorizeIncomeSuggestionsResponse>,
      log: string,
    ): CategorizeIncomeSuggestionsResponse => {
      const groups = new Map<string, CategorizeSuggestionGroup>();
      const claimed = new Set<string>();
      mergeOutcomeIntoGroups(groups, claimed, outcome, validIds);

      this.logger.log(`[CategorizeIncome] ${log}`);
      return {
        ...empty,
        ...extra,
        groups: sortedGroups(groups),
        unassigned: rows.filter((r) => !claimed.has(r.id)).map((r) => r.id),
      };
    };

    const resultKey = categorizeResultKey('aicatinc', accountId, rows.map((r) => r.id), categories);
    const cached = await this.cache.get<ModelOutcome>(resultKey);
    if (cached) {
      return finish(cached, {}, `cached candidates=${rows.length}`);
    }
    if (used >= limit) {
      return finish(null, { remainingToday: 0, limitReached: true }, `limit_reached candidates=${rows.length}`);
    }

    let raw: unknown;
    try {
      raw = await this.askModel(accountId, rows, categories);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[CategorizeIncome] ai_error: ${reason}`);
      return finish(null, {}, `ai_error candidates=${rows.length}`);
    }
    await this.cache.set(categorizeQuotaKey(accountId), used + 1, DAY_SECONDS);

    const validated = validateCategorization(raw, rows.length, categories);
    const outcome = toModelOutcome(validated, rows);
    await this.cache.set(resultKey, outcome, RESULT_TTL_SECONDS);

    return finish(
      outcome,
      { remainingToday: Math.max(0, limit - used - 1) },
      `candidates=${rows.length} ai=${validated.assignments.size + outcome.proposals.reduce((s, p) => s + p.ids.length, 0)} proposed=${outcome.proposals.length}`,
    );
  }

  private async askModel(
    accountId: string,
    rows: Array<{ description: string | null; amount: any; currencyCode: string; source: string }>,
    categories: Array<{ name: string }>,
  ): Promise<unknown> {
    const [account, owner] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: accountId }, select: { name: true } }),
      this.prisma.accountMember.findFirst({
        where: { accountId, role: 'owner' },
        select: { user: { select: { language: true } } },
      }),
    ]);
    const languageCode = owner?.user.language ?? 'en';
    const language = LANGUAGE_NAMES[languageCode] ?? 'English';
    const existingNames = categories.map((c) => sanitizeForPrompt(c.name, 50));
    const names = existingNames.join(', ') || '(none)';

    const lines = rows
      .map((r, i) => `${i}. description="${sanitizeForPrompt(r.description ?? '', 80)}" amount=${r.amount.toString()} ${r.currencyCode} source=${r.source}`)
      .join('\n');

    // No "Standard category names" line: v1 deliberately does not nudge the
    // model toward getDefaultCategories() for income (decision 4 in
    // docs/plans/categorize-uncategorized-incomes-plan.md) — it only offers
    // the account's own existing income categories.
    const prompt = `You organise a personal-finance account's incomes into categories.

--- INPUT DATA ---
Account name: "${sanitizeForPrompt(account?.name ?? '', 60)}"
Existing categories: ${names}
Incomes:
${lines}
--- END INPUT DATA ---

Rules:
- Prefer an EXISTING category whenever it genuinely fits. Put those in "assignments".
- Only when no existing category fits, group incomes into a NEW shared category in "newCategories". A new category must hold at least ${MIN_EXPENSES_PER_NEW_CATEGORY} incomes; never create one for a single income. At most ${MAX_NEW_CATEGORIES} new categories. Prefer broad, conventional names (a standard income category, e.g. Salary, Freelance, Gifts) over narrow ones.
- Name new categories in ${language}, as a short noun phrase of at most 30 characters, never restating an existing name.
- If you are not confident about an income, leave it out entirely.
- Refer to incomes ONLY by their number.`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: buildCategorizeSuggestionsFormat(existingNames),
      // Same input, same suggestion: a review the user reopens must not reshuffle.
      temperature: 0,
    });
    logCacheUsage(this.logger, 'categorize-income-suggestions', response.usage);
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty model response');
    return JSON.parse(content);
  }
}
