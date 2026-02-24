import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { resolveAiModel } from './model-resolver';

@Injectable()
export class SplitSuggestionService {
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async suggestSplits(
    accountId: string,
    expense: {
      id: string;
      description: string;
      amount: number;
      items?: Array<{ description: string; totalPrice: number }>;
    },
    userId?: string,
  ): Promise<{
    shouldSplit: boolean;
    confidence: number;
    suggestedSplits?: Array<{
      categoryId?: string;
      categoryName: string;
      amount: number;
      percentage: number;
      reasoning: string;
    }>;
  }> {
    // Resolve user's preferred AI model
    let aiModel = 'gpt-4o';
    if (userId) {
      const userPref = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
      aiModel = resolveAiModel(userPref?.aiModel).model;
    }

    // Fetch available categories
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });

    // If expense has items, try to categorize each item
    if (expense.items && expense.items.length > 1) {
      return this.suggestFromItems({ ...expense, items: expense.items }, categories, aiModel);
    }

    // Otherwise, use AI to detect if description implies multiple categories
    return this.suggestFromDescription(expense, categories, aiModel);
  }

  private async suggestFromItems(
    expense: {
      description: string;
      amount: number;
      items: Array<{ description: string; totalPrice: number }>;
    },
    categories: Array<{ id: string; name: string }>,
    aiModel: string,
  ): Promise<{
    shouldSplit: boolean;
    confidence: number;
    suggestedSplits?: Array<{
      categoryId?: string;
      categoryName: string;
      amount: number;
      percentage: number;
      reasoning: string;
    }>;
  }> {
    const categoryNames = categories.map(c => c.name).join(', ');

    const prompt = `Given a receipt with these items:
${expense.items.map(i => `- "${i.description}": ${i.totalPrice}`).join('\n')}

Total amount: ${expense.amount}
Available categories: ${categoryNames}

Group these items by category and calculate the total for each category.
Return JSON: {
  "shouldSplit": boolean,
  "confidence": 0.0-1.0,
  "splits": [{ "categoryName": "name", "amount": number, "percentage": number, "reasoning": "which items", "items": ["item1", "item2"] }]
}
Only suggest split if items clearly belong to 2+ different categories.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

      if (!result.shouldSplit || !result.splits || result.splits.length < 2) {
        return { shouldSplit: false, confidence: result.confidence || 0.5 };
      }

      const suggestedSplits = result.splits.map((split: any) => {
        const matchedCategory = categories.find(
          c => c.name.toLowerCase() === (split.categoryName || '').toLowerCase(),
        );
        return {
          categoryId: matchedCategory?.id,
          categoryName: split.categoryName,
          amount: split.amount,
          percentage: split.percentage || (split.amount / expense.amount) * 100,
          reasoning: split.reasoning || '',
        };
      });

      return {
        shouldSplit: true,
        confidence: result.confidence || 0.75,
        suggestedSplits,
      };
    } catch {
      return { shouldSplit: false, confidence: 0 };
    }
  }

  private async suggestFromDescription(
    expense: {
      description: string;
      amount: number;
    },
    categories: Array<{ id: string; name: string }>,
    aiModel: string,
  ): Promise<{
    shouldSplit: boolean;
    confidence: number;
    suggestedSplits?: Array<{
      categoryId?: string;
      categoryName: string;
      amount: number;
      percentage: number;
      reasoning: string;
    }>;
  }> {
    const categoryNames = categories.map(c => c.name).join(', ');

    const prompt = `Given this expense: "${expense.description}" for ${expense.amount}

Available categories: ${categoryNames}

Does this expense likely involve multiple categories? For example:
- "Walmart groceries and cleaning supplies" → Food + Home
- "Gas and car wash" → Transportation + Personal Care

Return JSON: {
  "shouldSplit": boolean,
  "confidence": 0.0-1.0,
  "splits": [{ "categoryName": "name", "percentage": number, "reasoning": "why" }] or null
}
Only suggest split if you're reasonably confident (>0.6) the expense spans multiple categories.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

      if (!result.shouldSplit || !result.splits || result.splits.length < 2) {
        return { shouldSplit: false, confidence: result.confidence || 0.3 };
      }

      const suggestedSplits = result.splits.map((split: any) => {
        const matchedCategory = categories.find(
          c => c.name.toLowerCase() === (split.categoryName || '').toLowerCase(),
        );
        const pct = split.percentage || 100 / result.splits.length;
        return {
          categoryId: matchedCategory?.id,
          categoryName: split.categoryName,
          amount: Math.round((expense.amount * pct) / 100 * 100) / 100,
          percentage: pct,
          reasoning: split.reasoning || '',
        };
      });

      return {
        shouldSplit: true,
        confidence: result.confidence || 0.65,
        suggestedSplits,
      };
    } catch {
      return { shouldSplit: false, confidence: 0 };
    }
  }
}
