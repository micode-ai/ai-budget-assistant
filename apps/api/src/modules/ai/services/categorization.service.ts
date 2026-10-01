import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { resolveAiModel, resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import { EmbeddingService } from './embedding.service';
import { logCacheUsage } from '../utils/log-cache-usage';

interface CategoryWithName {
  id: string;
  name: string;
}

/**
 * A category-name property: an enum of the exact names shown in the prompt when
 * there are any (the model cannot invent one), a plain string otherwise (an
 * empty enum is invalid in strict mode).
 */
function categoryProperty(names: string[]): Record<string, unknown> {
  const unique = Array.from(new Set(names.filter((n) => n.length > 0)));
  return unique.length > 0 ? { type: 'string', enum: unique } : { type: 'string' };
}

function strictFormat(name: string, properties: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name,
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
      },
    },
  };
}

/** Exported for tests. */
export function buildParseFormat(kind: 'expense' | 'income', categoryNames: string[]) {
  const properties: Record<string, unknown> = {
    amount: { type: 'number' },
    currency: { type: ['string', 'null'] },
    description: { type: 'string' },
    category: categoryProperty(categoryNames),
    confidence: { type: 'number' },
  };
  if (kind === 'expense') properties.merchant = { type: ['string', 'null'] };
  return strictFormat(`${kind}_parse`, properties);
}

/** Exported for tests. */
export function buildCategorizeFormat(categoryNames: string[]) {
  return strictFormat('categorize', {
    category: categoryProperty(categoryNames),
    confidence: { type: 'number' },
  });
}

@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async suggestFromHistory(
    accountId: string,
    description: string,
  ): Promise<{ categoryId: string; categoryName: string; confidence: number } | null> {
    if (!description || description.trim().length < 2) return null;

    const searchTerm = description.trim().toLowerCase();

    // Find recent expenses with similar descriptions
    const recentExpenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        categoryId: { not: null },
        description: { not: null },
      },
      select: { categoryId: true, description: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Count category frequency for matching descriptions
    const categoryFrequency = new Map<string, { count: number; name: string }>();
    let totalMatches = 0;

    for (const expense of recentExpenses) {
      if (!expense.categoryId || !expense.description) continue;
      const expenseDesc = expense.description.toLowerCase();

      // Match if descriptions are similar (contains or Levenshtein-like)
      if (expenseDesc.includes(searchTerm) || searchTerm.includes(expenseDesc)) {
        const current = categoryFrequency.get(expense.categoryId) || { count: 0, name: expense.category?.name || '' };
        current.count += 1;
        categoryFrequency.set(expense.categoryId, current);
        totalMatches++;
      }
    }

    if (totalMatches < 3) return null;

    // Find the most frequent category
    let bestCategoryId = '';
    let bestCount = 0;
    let bestName = '';

    for (const [categoryId, data] of categoryFrequency) {
      if (data.count > bestCount) {
        bestCount = data.count;
        bestCategoryId = categoryId;
        bestName = data.name;
      }
    }

    const frequency = bestCount / totalMatches;
    if (frequency < 0.7) return null;

    return {
      categoryId: bestCategoryId,
      categoryName: bestName,
      confidence: Math.min(0.95, 0.7 + (frequency - 0.7) * 0.8),
    };
  }

  async parseExpenseFromText(text: string, userId: string, accountId: string) {
    // Free-form natural-language extraction (amount + currency + description
    // + category + merchant from short voice/text input). Empirically the
    // cheap model loses fidelity on short multilingual transcripts — keep
    // honoring the user's aiModel preference (gpt-4o by default).
    const userPref = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { aiModel: true, currencyCode: true },
    });
    const { model: aiModel } = resolveAiModel(userPref?.aiModel);

    // Try history-based suggestion first (fast, free)
    const historySuggestion = await this.suggestFromHistory(accountId, text);

    // Embedding hint: if no history match, try semantic similarity. Used only
    // as a categoryId hint — the LLM still parses amount/currency/etc.
    const embeddingHint = historySuggestion
      ? null
      : await this.embeddingService.matchCategory(accountId, text).catch(() => null);

    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });

    const safeText = sanitizeForPrompt(text, 500);
    const categoryNameList = categories.map((c: CategoryWithName) => sanitizeForPrompt(c.name, 50));
    const categoryNames = categoryNameList.join(', ');

    const prompt = `Parse the following expense description and extract structured data.

--- INPUT DATA ---
Description: "${safeText}"
Available categories: ${categoryNames}
--- END INPUT DATA ---

Return a JSON object with:
- amount: number (the expense amount)
- currency: string (currency code like USD, EUR, PLN)
- description: string (a brief description of the expense)
- category: string (the most appropriate category from the list)
- confidence: number (0-1, how confident you are in the categorization)
- merchant: string | null (merchant name if mentioned)

If no amount is stated, return 0 — never estimate one.
If no currency is stated or shown by a symbol, return null for currency.`;

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      response_format: buildParseFormat('expense', categoryNameList),
    });
    logCacheUsage(this.logger, 'parse-expense', response.usage);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }
    const result = JSON.parse(content);

    // Find matching category
    const matchedCategory = categories.find(
      (c: CategoryWithName) => c.name.toLowerCase() === result.category?.toLowerCase(),
    );

    return {
      amount: result.amount || 0,
      currencyCode: result.currency || userPref?.currencyCode || 'USD',
      description: result.description || text,
      categoryId: historySuggestion?.categoryId || embeddingHint?.categoryId || matchedCategory?.id,
      categorySuggestion: historySuggestion?.categoryName || embeddingHint?.categoryName || result.category,
      confidence: historySuggestion?.confidence || embeddingHint?.similarity || result.confidence || 0.5,
      merchant: result.merchant,
    };
  }

  async parseIncomeFromText(text: string, userId: string, accountId: string) {
    const userPref = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { aiModel: true, currencyCode: true },
    });
    const { model: aiModel } = resolveAiModel(userPref?.aiModel);

    const historySuggestion = await this.suggestFromHistory(accountId, text);
    const embeddingHint = historySuggestion
      ? null
      : await this.embeddingService.matchCategory(accountId, text).catch(() => null);

    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'income',
        isDeleted: false,
      },
    });

    const safeText = sanitizeForPrompt(text, 500);
    const categoryNameList = categories.map((c: CategoryWithName) => sanitizeForPrompt(c.name, 50));
    const categoryNames = categoryNameList.join(', ');

    const prompt = `Parse the following income description and extract structured data.

--- INPUT DATA ---
Description: "${safeText}"
Available income categories: ${categoryNames}
--- END INPUT DATA ---

Return a JSON object with:
- amount: number (the income amount)
- currency: string (currency code like USD, EUR, PLN)
- description: string (a brief description of the income)
- category: string (the most appropriate income category from the list)
- confidence: number (0-1, how confident you are in the categorization)

If no amount is stated, return 0 — never estimate one.
If no currency is stated or shown by a symbol, return null for currency.`;

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      response_format: buildParseFormat('income', categoryNameList),
    });
    logCacheUsage(this.logger, 'parse-income', response.usage);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }
    const result = JSON.parse(content);

    const matchedCategory = categories.find(
      (c: CategoryWithName) => c.name.toLowerCase() === result.category?.toLowerCase(),
    );

    return {
      amount: result.amount || 0,
      currencyCode: result.currency || userPref?.currencyCode || 'USD',
      description: result.description || text,
      categoryId: historySuggestion?.categoryId || embeddingHint?.categoryId || matchedCategory?.id,
      categorySuggestion: historySuggestion?.categoryName || embeddingHint?.categoryName || result.category,
      confidence: historySuggestion?.confidence || embeddingHint?.similarity || result.confidence || 0.5,
    };
  }

  async categorize(description: string, userId: string, accountId: string) {
    // Cheap model: classification only.
    void userId;
    const aiModel = resolveCheapModel();

    // Try history-based suggestion first (fast, free)
    const historySuggestion = await this.suggestFromHistory(accountId, description);
    if (historySuggestion) {
      return {
        categoryId: historySuggestion.categoryId,
        categoryName: historySuggestion.categoryName,
        confidence: historySuggestion.confidence,
      };
    }

    // Try embedding similarity next — much cheaper than the LLM call below.
    // Skips when no category has an embedding yet (pre-backfill state).
    try {
      const embeddingMatch = await this.embeddingService.matchCategory(accountId, description);
      if (embeddingMatch) {
        return {
          categoryId: embeddingMatch.categoryId,
          categoryName: embeddingMatch.categoryName,
          confidence: embeddingMatch.similarity,
        };
      }
    } catch {
      // Embedding lookup failed — fall through to LLM.
    }

    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });

    const safeDescription = sanitizeForPrompt(description, 500);
    const categoryNameList = categories.map((c: CategoryWithName) => sanitizeForPrompt(c.name, 50));
    const prompt = `Given the expense description: "${safeDescription}"
And these available categories: ${categoryNameList.join(', ')}

Return a JSON object with:
- category: the most appropriate category name
- confidence: a number 0-1 indicating confidence`;

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      response_format: buildCategorizeFormat(categoryNameList),
    });
    logCacheUsage(this.logger, 'categorize', response.usage);

    const categorizeContent = response.choices[0]?.message?.content;
    if (!categorizeContent) {
      throw new Error('No response from AI');
    }
    const result = JSON.parse(categorizeContent);
    const matchedCategory = categories.find(
      (c: CategoryWithName) => c.name.toLowerCase() === result.category?.toLowerCase(),
    );

    return {
      categoryId: matchedCategory?.id,
      categoryName: result.category,
      confidence: result.confidence || 0.5,
    };
  }
}
