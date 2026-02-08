import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';

interface CategoryWithName {
  id: string;
  name: string;
}

@Injectable()
export class CategorizationService {
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async parseExpenseFromText(text: string, userId: string, accountId: string) {
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });

    const categoryNames = categories.map((c: CategoryWithName) => c.name).join(', ');

    const prompt = `Parse the following expense description and extract structured data.

Description: "${text}"

Available categories: ${categoryNames}

Return a JSON object with:
- amount: number (the expense amount)
- currency: string (currency code like USD, EUR, PLN)
- description: string (a brief description of the expense)
- category: string (the most appropriate category from the list)
- confidence: number (0-1, how confident you are in the categorization)
- merchant: string | null (merchant name if mentioned)

If the amount is not specified, estimate a reasonable amount or set to 0.
If the currency is not specified, default to USD.

Only return valid JSON, no other text.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

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
      currencyCode: result.currency || 'USD',
      description: result.description || text,
      categoryId: matchedCategory?.id,
      categorySuggestion: result.category,
      confidence: result.confidence || 0.5,
      merchant: result.merchant,
    };
  }

  async categorize(description: string, userId: string, accountId: string) {
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });

    const prompt = `Given the expense description: "${description}"
And these available categories: ${categories.map((c: CategoryWithName) => c.name).join(', ')}

Return a JSON object with:
- category: the most appropriate category name
- confidence: a number 0-1 indicating confidence

Only return valid JSON.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

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
