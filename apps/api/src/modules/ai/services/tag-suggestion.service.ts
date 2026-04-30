import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { resolveCheapModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class TagSuggestionService {
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

  async suggestTags(
    accountId: string,
    description: string,
    merchant?: string,
    userId?: string,
  ): Promise<{ tags: Array<{ name: string; confidence: number; source: 'history' | 'embedding' | 'ai'; existingTagId?: string }> }> {
    // 1. Try history-based suggestions first (free)
    const historySuggestions = await this.suggestFromHistory(accountId, description, merchant);
    if (historySuggestions.length >= 3) {
      return { tags: historySuggestions };
    }

    // 2. Embedding match — picks one high-confidence existing tag without
    //    a chat-completions roundtrip.
    const embeddingSuggestions = await this.suggestFromEmbedding(accountId, description);

    // 3. Fall back to AI for additional creative suggestions
    const aiSuggestions = await this.suggestWithAI(accountId, description, merchant, userId);

    const seenIds = new Set(
      [...historySuggestions, ...embeddingSuggestions]
        .map(s => s.existingTagId)
        .filter((id): id is string => Boolean(id)),
    );
    const seenNames = new Set(
      [...historySuggestions, ...embeddingSuggestions].map(s => s.name.toLowerCase()),
    );
    const merged = [
      ...historySuggestions,
      ...embeddingSuggestions.filter(s => !seenIds.has(s.existingTagId || '')),
      ...aiSuggestions.filter(s => !seenNames.has(s.name.toLowerCase()) && !seenIds.has(s.existingTagId || '')),
    ].slice(0, 5);

    return { tags: merged };
  }

  private async suggestFromEmbedding(
    accountId: string,
    description: string,
  ): Promise<Array<{ name: string; confidence: number; source: 'embedding'; existingTagId: string }>> {
    try {
      const match = await this.embeddingService.matchTag(accountId, description);
      if (!match) return [];
      return [{
        name: match.tagName,
        confidence: match.similarity,
        source: 'embedding',
        existingTagId: match.tagId,
      }];
    } catch {
      return [];
    }
  }

  private async suggestFromHistory(
    accountId: string,
    description: string,
    _merchant?: string,
  ): Promise<Array<{ name: string; confidence: number; source: 'history'; existingTagId: string }>> {
    // Find expenses with similar descriptions that have tags
    const searchTerms = description.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (searchTerms.length === 0) return [];

    const recentExpenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        expenseTags: { some: { isDeleted: false } },
      },
      include: {
        expenseTags: {
          where: { isDeleted: false },
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Score by description similarity
    const tagFrequency = new Map<string, { tag: { id: string; name: string }; count: number }>();
    let matchCount = 0;

    for (const expense of recentExpenses) {
      const expDesc = (expense.description || '').toLowerCase();
      const isMatch = searchTerms.some(term => expDesc.includes(term));
      if (!isMatch) continue;
      matchCount++;

      for (const et of expense.expenseTags) {
        if (!et.tag) continue;
        const key = et.tag.id;
        const current = tagFrequency.get(key) || { tag: { id: et.tag.id, name: et.tag.name }, count: 0 };
        current.count++;
        tagFrequency.set(key, current);
      }
    }

    if (matchCount < 2) return [];

    return Array.from(tagFrequency.values())
      .map(({ tag, count }) => ({
        name: tag.name,
        confidence: Math.min(0.95, 0.5 + (count / matchCount) * 0.45),
        source: 'history' as const,
        existingTagId: tag.id,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  private async suggestWithAI(
    accountId: string,
    description: string,
    merchant?: string,
    userId?: string,
  ): Promise<Array<{ name: string; confidence: number; source: 'ai'; existingTagId?: string }>> {
    // Get existing tags for context
    const existingTags = await this.prisma.tag.findMany({
      where: { accountId, isDeleted: false },
      orderBy: { usageCount: 'desc' },
      take: 50,
    });

    const safeDescription = sanitizeForPrompt(description, 200);
    const safeMerchant = merchant ? sanitizeForPrompt(merchant, 100) : undefined;
    const tagList = existingTags.map((t: typeof existingTags[number]) => sanitizeForPrompt(t.name, 30)).join(', ');

    const prompt = `Given the expense description: "${safeDescription}"${safeMerchant ? ` from merchant: "${safeMerchant}"` : ''}

Existing tags in this account: ${tagList || 'none yet'}

Suggest 3-5 relevant tags for this expense. Prefer existing tags when they fit.
Return JSON: { "tags": [{ "name": "tag name", "confidence": 0.0-1.0, "isExisting": boolean }] }
Tags should be short (1-3 words), lowercase, descriptive labels like: subscriptions, entertainment, monthly, groceries, dining-out, work-expense, etc.`;

    // Cheap model: tag suggestion is short structured classification.
    void userId;
    const aiModel = resolveCheapModel();

    try {
      const response = await this.openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{"tags":[]}');
      const suggestedTags: Array<{ name: string; confidence: number; source: 'ai'; existingTagId?: string }> = [];

      for (const tag of result.tags || []) {
        const existingTag = existingTags.find(
          (t: typeof existingTags[number]) => t.name.toLowerCase() === (tag.name || '').toLowerCase(),
        );
        suggestedTags.push({
          name: tag.name,
          confidence: tag.confidence || 0.7,
          source: 'ai',
          existingTagId: existingTag?.id,
        });
      }

      return suggestedTags;
    } catch {
      return [];
    }
  }
}
