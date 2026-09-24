import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  CategorizeCandidateExpense,
  CategorizeSuggestionGroup,
  CategorizeSuggestionsResponse,
} from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { MerchantRulesService } from '../../merchant-rules/merchant-rules.service';
import { isDepositCategoryName } from '../../../common/utils/deposit-category';
import { getDefaultCategories } from '../../accounts/default-categories';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import {
  MAX_NEW_CATEGORIES,
  MIN_EXPENSES_PER_NEW_CATEGORY,
  validateCategorization,
} from '../utils/categorize-suggestions.util';

const MAX_CANDIDATES = 100;
const DAY_SECONDS = 24 * 60 * 60;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', pl: 'Polish', de: 'German', es: 'Spanish', fr: 'French',
  ru: 'Russian', ua: 'Ukrainian', be: 'Belarusian', nl: 'Dutch',
};

/** NaN-guarded; default 5 passes per account per day. */
function resolveDailyLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

const normalizeMerchant = (m: string | null) => (m ?? '').trim().toLowerCase();

/**
 * Proposes categories for an account's uncategorized expenses. READ-ONLY: it
 * writes nothing — the client creates categories and applies them only after
 * the user reviews. Cheapest first: learned merchant rules, then ONE model
 * call for the rest, so the model sees the whole batch and can group it into
 * a few shared categories instead of inventing one per expense.
 */
@Injectable()
export class CategorizeSuggestionsService {
  private readonly logger = new Logger(CategorizeSuggestionsService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly merchantRules: MerchantRulesService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async suggest(accountId: string): Promise<CategorizeSuggestionsResponse> {
    const baseWhere = {
      accountId,
      categoryId: null,
      isDeleted: false,
      isPlanned: false,
      isSplitReceivable: false,
      isDebt: false,
    };
    const [rows, skippedEncrypted] = await Promise.all([
      this.prisma.expense.findMany({
        where: { ...baseWhere, encryptedPayload: null },
        select: {
          id: true, clientId: true, merchant: true, description: true,
          amount: true, currencyCode: true, date: true,
          items: { select: { description: true }, take: 5 },
        },
        orderBy: { date: 'desc' },
        take: MAX_CANDIDATES,
      }),
      this.prisma.expense.count({ where: { ...baseWhere, encryptedPayload: { not: null } } }),
    ]);

    const expenses: CategorizeCandidateExpense[] = rows.map((r: any) => ({
      id: r.id,
      clientId: r.clientId ?? null,
      merchant: r.merchant ?? null,
      description: r.description ?? null,
      amount: Number(r.amount.toString()),
      currencyCode: r.currencyCode,
      date: r.date.toISOString().slice(0, 10),
    }));

    const limit = resolveDailyLimit(process.env.AI_CATEGORIZE_MAX_PER_DAY);
    const used = (await this.cache.get<number>(this.quotaKey(accountId))) ?? 0;
    const empty = { expenses, groups: [], unassigned: [], skippedEncrypted, remainingToday: Math.max(0, limit - used), limitReached: false };
    if (rows.length === 0) {
      this.logger.log(`[Categorize] no_candidates account=${accountId}`);
      return empty;
    }

    const allCategories = await this.prisma.category.findMany({
      where: { accountId, type: 'expense', isDeleted: false },
      select: { id: true, name: true },
    });
    const categories = allCategories.filter((c: { name: string }) => !isDepositCategoryName(c.name));
    const validIds = new Set(categories.map((c: { id: string }) => c.id));

    // 1. Merchant rules — free.
    const rules = await this.merchantRules.getRulesMap(accountId);
    const byCategory = new Map<string, string[]>();
    const remaining: typeof rows = [];
    for (const r of rows) {
      const ruled = rules.get(normalizeMerchant(r.merchant));
      if (ruled && validIds.has(ruled)) {
        byCategory.set(ruled, [...(byCategory.get(ruled) ?? []), r.id]);
      } else {
        remaining.push(r);
      }
    }
    const ruleCount = rows.length - remaining.length;

    const buildGroups = (proposals: Array<{ name: string; ids: string[] }>): CategorizeSuggestionGroup[] => [
      ...[...byCategory.entries()].map(([categoryId, expenseIds]) => ({ categoryId, proposedName: null, expenseIds })),
      ...proposals.map((p) => ({ categoryId: null, proposedName: p.name, expenseIds: p.ids })),
    ];

    if (remaining.length === 0) {
      this.logger.log(`[Categorize] all_rules candidates=${rows.length} rules=${ruleCount}`);
      return { ...empty, groups: buildGroups([]) };
    }
    if (used >= limit) {
      this.logger.log(`[Categorize] limit_reached candidates=${rows.length} rules=${ruleCount}`);
      return { ...empty, groups: buildGroups([]), unassigned: remaining.map((r) => r.id), remainingToday: 0, limitReached: true };
    }

    // 2. One model call for the rest.
    let raw: unknown;
    try {
      raw = await this.askModel(accountId, remaining, categories);
    } catch (err) {
      this.logger.warn(`[Categorize] ai_error candidates=${rows.length} rules=${ruleCount}: ${err instanceof Error ? err.message : String(err)}`);
      return { ...empty, groups: buildGroups([]), unassigned: remaining.map((r) => r.id) };
    }
    await this.cache.set(this.quotaKey(accountId), used + 1, DAY_SECONDS);

    const validated = validateCategorization(raw, remaining.length, categories);
    for (const [index, categoryId] of validated.assignments) {
      byCategory.set(categoryId, [...(byCategory.get(categoryId) ?? []), remaining[index].id]);
    }
    const proposals = validated.proposals.map((p) => ({ name: p.name, ids: p.indexes.map((i) => remaining[i].id) }));
    const unassigned = validated.unassigned.map((i) => remaining[i].id);

    this.logger.log(
      `[Categorize] candidates=${rows.length} rules=${ruleCount} ai=${validated.assignments.size + proposals.reduce((s, p) => s + p.ids.length, 0)} proposed=${proposals.length} unassigned=${unassigned.length}`,
    );
    return {
      expenses,
      groups: buildGroups(proposals),
      unassigned,
      skippedEncrypted,
      remainingToday: Math.max(0, limit - used - 1),
      limitReached: false,
    };
  }

  private async askModel(
    accountId: string,
    remaining: Array<{ merchant: string | null; description: string | null; amount: any; currencyCode: string; items: Array<{ description: string | null }> }>,
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
    const names = categories.map((c) => sanitizeForPrompt(c.name, 50)).join(', ') || '(none)';

    // Spec input: nudge the model toward this language's standard budgeting
    // category names instead of inventing near-duplicates. Excludes names that
    // already exist on the account (case-insensitive) and the deposit name.
    // default-categories.ts has no field marking a name as income-only (e.g.
    // "Salary"/"Freelance" sit in the same array as "Groceries"), so both kinds
    // are offered here — a known imprecision, harmless in practice since a
    // standard name is still just a candidate the user reviews before Apply.
    const existingLower = new Set(categories.map((c) => c.name.trim().toLowerCase()));
    const standardNames =
      getDefaultCategories(languageCode)
        .map((c) => c.name)
        .filter((name) => !existingLower.has(name.trim().toLowerCase()))
        .filter((name) => !isDepositCategoryName(name))
        .map((name) => sanitizeForPrompt(name, 50))
        .join(', ') || '(none)';

    const lines = remaining
      .map((r, i) => {
        const items = r.items.map((it) => it.description).filter(Boolean).slice(0, 5).join('; ');
        return `${i}. merchant="${sanitizeForPrompt(r.merchant ?? '', 60)}" description="${sanitizeForPrompt(r.description ?? '', 80)}" amount=${r.amount.toString()} ${r.currencyCode}${items ? ` items="${sanitizeForPrompt(items, 150)}"` : ''}`;
      })
      .join('\n');

    const prompt = `You organise a personal-finance account's expenses into categories.

--- INPUT DATA ---
Account name: "${sanitizeForPrompt(account?.name ?? '', 60)}"
Existing categories: ${names}
Standard category names (use one of these as a NEW category name when it genuinely fits, instead of inventing one): ${standardNames}
Expenses:
${lines}
--- END INPUT DATA ---

Rules:
- Prefer an EXISTING category whenever it genuinely fits. Put those in "assignments".
- Only when no existing category fits, group expenses into a NEW shared category in "newCategories". Prefer one of the standard category names above when it genuinely fits; only invent a new name when none of those fit either. A new category must hold at least ${MIN_EXPENSES_PER_NEW_CATEGORY} expenses; never create one for a single expense. At most ${MAX_NEW_CATEGORIES} new categories. Prefer broad, conventional names (a standard budgeting category) over narrow ones, and use the account's purpose (its name and existing categories) to choose them.
- Name new categories in ${language}, as a short noun phrase of at most 30 characters, never restating an existing name.
- If you are not confident about an expense, leave it out entirely.
- Refer to expenses ONLY by their number.

Return JSON: {"assignments":[{"index":0,"categoryName":"..."}],"newCategories":[{"name":"...","indexes":[1,2]}]}`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty model response');
    return JSON.parse(content);
  }

  private quotaKey(accountId: string): string {
    return `aicat:${accountId}:${new Date().toISOString().slice(0, 10)}`;
  }
}
