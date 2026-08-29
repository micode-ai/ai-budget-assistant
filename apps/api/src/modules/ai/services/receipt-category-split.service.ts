import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CacheService } from '../../../common/cache/cache.service';
import { ProductRulesService, normalizeProductName } from '../../merchant-rules/product-rules.service';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import { depositCategoryName, isDepositCategoryName } from '../../../common/utils/deposit-category';

export interface ClassifyLine {
  index: number;
  /** canonicalName when we have one, else the raw description. Sent to the model. */
  label: string;
  /**
   * The receipt's own printed line, which is what the learned-rule cache is
   * keyed on. Deliberately NOT `label`: `canonicalName` is invented by the
   * model and is not stable across two scans of the same product ("piwo
   * carlsberg 0,5l" one day, "carlsberg 0,5l" the next), so keying on it meant
   * the cache never hit. The till prints the same characters every time.
   */
  ruleKey: string;
  amount: number;
}

export interface ProposedCategory {
  /** Validated, normalized name. Never equal to an existing category's name. */
  name: string;
  /** Indexes in `ClassifyLine.index` space, not the 1-based prompt numbering. */
  itemIndexes: number[];
}

export interface ClassifyResult {
  assignments: Map<number, string>;
  proposals: ProposedCategory[];
}

export const MAX_PROPOSED_CATEGORIES = 3;
const MIN_PROPOSED_NAME_LEN = 2;
const MAX_PROPOSED_NAME_LEN = 30;

/**
 * Key a proposal is grouped under inside `buildCategorySplits`, which needs an
 * opaque string id. It is rewritten to `categoryId: null` before the payload
 * leaves the server and must never reach a DTO or the database.
 */
export const PROPOSED_KEY_PREFIX = 'proposed:';
export const proposedKey = (name: string): string => `${PROPOSED_KEY_PREFIX}${name}`;
export const isProposedKey = (key: string): boolean => key.startsWith(PROPOSED_KEY_PREFIX);
export const proposedNameFromKey = (key: string): string => key.slice(PROPOSED_KEY_PREFIX.length);

/**
 * A lookup table, not a dependency: `PromptBuilderService.localeToLanguageName`
 * is a method on a service this one has no other reason to inject.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  ua: 'Ukrainian',
  be: 'Belarusian',
  nl: 'Dutch',
};
const languageName = (language?: string): string => LANGUAGE_NAMES[language ?? ''] ?? 'English';

// Re-exported so receipt-finalizer.service.ts keeps its existing import path.
export { depositCategoryName };

/** NaN-guarded, mirroring parseInferenceQuotaEnv in the AI import path. */
function resolveDailyLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

/**
 * Assigns receipt lines to categories: learned rules first, the model only for
 * what is left.
 *
 * The model returns line numbers and category NAMES and nothing else — never an
 * amount, a percentage or a total. That is the same contract the AI statement
 * import holds the model to, and it is what lets buildCategorySplits own all
 * arithmetic. Anything the model invents is dropped, not trusted.
 */
@Injectable()
export class ReceiptCategorySplitService {
  private readonly logger = new Logger(ReceiptCategorySplitService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly productRules: ProductRulesService,
    private readonly cache: CacheService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async classify(params: {
    accountId: string;
    items: ClassifyLine[];
    categories: Array<{ id: string; name: string }>;
    language?: string;
  }): Promise<ClassifyResult> {
    const { accountId, items, categories, language } = params;
    const assigned = new Map<number, string>();
    const empty: ClassifyResult = { assignments: assigned, proposals: [] };
    if (items.length === 0 || categories.length === 0) return empty;

    const rules = await this.productRules.getRulesMap(accountId);

    // The returnable-packaging deposit is appended by the finalizer as its own
    // group with NO receipt line behind it, so no line may ever resolve to it.
    // It is a real category in the account (created by the first receipt that
    // printed a kaucja), which is exactly the trap: left in this list it is
    // offered to the model like any other, and on 2026-08-29 a Lidl receipt
    // filed cured ham, bacon and peanuts under "Kaucja". The save-time learner
    // then wrote those as rules, so the mistake would have repeated forever
    // without another model call. Excluded from BOTH halves below.
    const depositCategoryIds = new Set(
      categories.filter((c) => isDepositCategoryName(c.name)).map((c) => c.id),
    );
    const assignable = categories.filter((c) => !depositCategoryIds.has(c.id));
    const validCategoryIds = new Set(assignable.map((c) => c.id));

    const unresolved: ClassifyLine[] = [];
    for (const line of items) {
      const ruleCategoryId = rules.get(normalizeProductName(line.ruleKey));
      // A rule can outlive its category (a stale row, a cross-account id), and
      // a rule written before this guard existed can point at the deposit
      // category: only honour it if the category is still an assignable one of
      // this account's. This is what neutralises the poisoned rows already in
      // production, ahead of the migration that deletes them.
      if (ruleCategoryId && validCategoryIds.has(ruleCategoryId)) {
        assigned.set(line.index, ruleCategoryId);
      } else {
        unresolved.push(line);
      }
    }

    if (unresolved.length === 0) return empty;
    // Nothing left to ask about once the deposit category is taken out.
    if (assignable.length === 0) return empty;
    if (!(await this.hasQuotaRemaining(accountId))) {
      this.logger.log(`[CategorySplit] daily inference quota spent for ${accountId}; rules only`);
      return empty;
    }

    try {
      const learned = await this.classifyWithModel(unresolved, assignable, language);
      // Only a call that actually returned counts against the daily ceiling — a
      // thrown/failed call must not silently eat a user's quota for nothing.
      await this.recordInferenceUse(accountId);
      for (const [index, categoryId] of learned.assignments) assigned.set(index, categoryId);
      // No rule is learned here on purpose. The save-time learner in
      // ExpensesService.create writes rules from the categories the lines
      // actually ended up with, so a scan the user abandons teaches nothing.
      return { assignments: assigned, proposals: learned.proposals };
    } catch (error) {
      this.logger.warn(`[CategorySplit] model classification skipped: ${error}`);
    }

    return empty;
  }

  private async classifyWithModel(
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
    language?: string,
  ): Promise<ClassifyResult> {
    const numbered = lines.map((line, i) => `${i + 1}. ${sanitizeForPrompt(line.label)}`).join('\n');
    const categoryNames = categories.map((c) => c.name).join(', ');

    const prompt = `Assign each receipt line to exactly one category.

Lines:
${numbered}

Categories: ${categoryNames}

Return JSON: {"assignments":[{"line":1,"category":"<one of the categories above>"}],"newCategories":[{"name":"<new category>","lines":[2,3]}]}
Use only the category names listed, spelled exactly as given.
Omit a line entirely if you are not confident.
Alcohol, tobacco, household chemicals, cosmetics, pet supplies and baby goods are each a separate kind of spending. NEVER put such a line in a general groceries or food category. Assign it to a listed category that names its kind, and when no listed category names it, group those lines into a new one in "newCategories" — up to ${MAX_PROPOSED_CATEGORIES}, each named in ${languageName(language)} as a short noun phrase, never restating a listed name. Beer, wine and spirits are alcohol, not groceries. Everything else goes in "assignments"; leave "newCategories" empty when there is no such group.
Do not return any amounts, prices, totals or percentages.`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const assignments = this.validateAssignments(parsed?.assignments, lines, categories);
    const proposals = this.validateProposals(parsed?.newCategories, lines, categories, new Set(assignments.keys()));
    return { assignments, proposals };
  }

  /**
   * A Set, not an object map, so that inherited keys like "constructor" cannot
   * pass as a category name — the same trap the AI import validator avoids.
   */
  private validateAssignments(
    raw: unknown,
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
  ): Map<number, string> {
    const result = new Map<number, string>();
    if (!Array.isArray(raw)) return result;

    const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const allowed = new Set(byName.keys());

    for (const entry of raw) {
      const lineNumber = Number(entry?.line);
      if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) continue;

      const name = String(entry?.category ?? '').trim().toLowerCase();
      if (!allowed.has(name)) continue;

      result.set(lines[lineNumber - 1].index, byName.get(name)!);
    }
    return result;
  }

  /**
   * Same posture as `validateAssignments`: anything invented, malformed or
   * duplicated is dropped, never repaired. `claimed` carries the line indexes
   * the assignments already took, so an assignment always wins a contested line
   * and the outcome does not depend on the order the model emitted things in.
   */
  private validateProposals(
    raw: unknown,
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
    claimed: Set<number>,
  ): ProposedCategory[] {
    if (!Array.isArray(raw)) return [];

    const taken = new Set(categories.map((c) => c.name.trim().toLowerCase()));
    const result: ProposedCategory[] = [];

    for (const entry of raw) {
      if (result.length >= MAX_PROPOSED_CATEGORIES) break;

      const name = String(entry?.name ?? '')
        // eslint-disable-next-line no-control-regex -- intentional: strip control chars from a model-supplied name
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name.length < MIN_PROPOSED_NAME_LEN || name.length > MAX_PROPOSED_NAME_LEN) continue;
      // A name with no letter at all is a number, a code or punctuation.
      if (!/\p{L}/u.test(name)) continue;
      if (taken.has(name.toLowerCase())) continue;
      // The deposit category is ours and is appended by the finalizer, so a
      // proposal must never mint a second one. `taken` cannot catch this: the
      // real deposit category is filtered out of the list handed to the model
      // precisely so it is not assignable, which also removes it from here.
      if (isDepositCategoryName(name)) continue;

      const itemIndexes: number[] = [];
      for (const rawLine of Array.isArray(entry?.lines) ? entry.lines : []) {
        const lineNumber = Number(rawLine);
        if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) continue;
        const index = lines[lineNumber - 1].index;
        if (claimed.has(index)) continue;
        claimed.add(index);
        itemIndexes.push(index);
      }
      if (itemIndexes.length === 0) continue;

      taken.add(name.toLowerCase());
      result.push({ name, itemIndexes });
    }

    return result;
  }

  /**
   * Redis, not usage_logs: the only writer of that table is trackAiUsage, the
   * monthly billing counter this path is specified to stay out of.
   *
   * Read-only: this is the pre-check gate before spending money on a model
   * call. The increment lives separately in recordInferenceUse, which only
   * runs once classifyWithModel has actually returned — a check-then-act race
   * between the two (two concurrent requests both reading "quota remaining"
   * before either increments) is the same benign race the AI import ceiling
   * accepts, because this is an abuse ceiling, not an accounting record.
   */
  private async hasQuotaRemaining(accountId: string): Promise<boolean> {
    const limit = resolveDailyLimit(process.env.AI_SPLIT_MAX_INFERENCES_PER_DAY);
    const used = (await this.cache.get<number>(this.quotaKey(accountId))) ?? 0;
    return used < limit;
  }

  /**
   * Increments the daily counter. Called only after a model call has
   * successfully returned — a failed/thrown call must leave this untouched, so
   * an OpenAI outage cannot silently spend a user's daily inferences while
   * delivering nothing.
   */
  private async recordInferenceUse(accountId: string): Promise<void> {
    const used = (await this.cache.get<number>(this.quotaKey(accountId))) ?? 0;
    await this.cache.set(this.quotaKey(accountId), used + 1, 24 * 60 * 60);
  }

  private quotaKey(accountId: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `aisplit:${accountId}:${day}`;
  }
}
