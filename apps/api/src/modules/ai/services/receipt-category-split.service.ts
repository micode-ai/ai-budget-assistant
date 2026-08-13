import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CacheService } from '../../../common/cache/cache.service';
import { ProductRulesService, normalizeProductName } from '../../merchant-rules/product-rules.service';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';

export interface ClassifyLine {
  index: number;
  /** canonicalName when we have one, else the raw description. */
  label: string;
  amount: number;
}

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
  }): Promise<Map<number, string>> {
    const { accountId, items, categories } = params;
    const assigned = new Map<number, string>();
    if (items.length === 0 || categories.length === 0) return assigned;

    const rules = await this.productRules.getRulesMap(accountId);
    const validCategoryIds = new Set(categories.map((c) => c.id));

    const unresolved: ClassifyLine[] = [];
    for (const line of items) {
      const ruleCategoryId = rules.get(normalizeProductName(line.label));
      // A rule can outlive its category (a stale row, a cross-account id): only
      // honour it if the category is still one of this account's.
      if (ruleCategoryId && validCategoryIds.has(ruleCategoryId)) {
        assigned.set(line.index, ruleCategoryId);
      } else {
        unresolved.push(line);
      }
    }

    if (unresolved.length === 0) return assigned;
    if (!(await this.hasQuotaRemaining(accountId))) {
      this.logger.log(`[CategorySplit] daily inference quota spent for ${accountId}; rules only`);
      return assigned;
    }

    try {
      const learned = await this.classifyWithModel(unresolved, categories);
      // Only a call that actually returned counts against the daily ceiling — a
      // thrown/failed call must not silently eat a user's quota for nothing.
      await this.recordInferenceUse(accountId);
      for (const [index, categoryId] of learned) assigned.set(index, categoryId);

      const newRules = Array.from(learned.entries()).map(([index, categoryId]) => ({
        canonicalName: unresolved.find((l) => l.index === index)!.label,
        categoryId,
      }));
      if (newRules.length > 0) await this.productRules.upsertRules(accountId, newRules);
    } catch (error) {
      this.logger.warn(`[CategorySplit] model classification skipped: ${error}`);
    }

    return assigned;
  }

  private async classifyWithModel(
    lines: ClassifyLine[],
    categories: Array<{ id: string; name: string }>,
  ): Promise<Map<number, string>> {
    const numbered = lines.map((line, i) => `${i + 1}. ${sanitizeForPrompt(line.label)}`).join('\n');
    const categoryNames = categories.map((c) => c.name).join(', ');

    const prompt = `Assign each receipt line to exactly one category.

Lines:
${numbered}

Categories: ${categoryNames}

Return JSON: {"assignments":[{"line":1,"category":"<one of the categories above>"}]}
Use only the category names listed, spelled exactly as given.
Omit a line entirely if you are not confident.
Do not return any amounts, prices, totals or percentages.`;

    const response = await this.openai.chat.completions.create({
      model: resolveCheapModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    return this.validateAssignments(parsed?.assignments, lines, categories);
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
