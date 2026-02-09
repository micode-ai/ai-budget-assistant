import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';

export interface ReceiptItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
}

export interface ParsedReceipt {
  merchantName: string | null;
  merchantAddress: string | null;
  date: string | null;
  time: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  total: number;
  currency: string;
  paymentMethod: string | null;
  confidence: number;
  rawText: string;
}

export interface ReceiptExpense {
  amount: number;
  discountAmount: number | null;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  categorySuggestion: string | null;
  merchant: string | null;
  date: string | null;
  confidence: number;
  receiptItems: ReceiptItem[];
}

interface CategoryWithName {
  id: string;
  name: string;
}

@Injectable()
export class OcrService {
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async parseReceipt(
    imageBase64: string,
    userId: string,
    accountId: string,
  ): Promise<ReceiptExpense> {
    // Get account's categories for categorization
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });

    const categoryNames = categories.map((c: CategoryWithName) => c.name).join(', ');

    const prompt = `Analyze this receipt image and extract all information.

Available expense categories for classification: ${categoryNames}

Return a JSON object with the following structure:
{
  "merchantName": "store/restaurant name or null if not found",
  "merchantAddress": "address or null",
  "date": "YYYY-MM-DD format or null",
  "time": "HH:MM format or null",
  "items": [
    {
      "description": "clean, normalized product name (see normalization rules below)",
      "quantity": 1,
      "unitPrice": 10.00,
      "totalPrice": 10.00
    }
  ],
  "subtotal": number or null,
  "discount": total discount amount or null,
  "tax": number or null,
  "total": total amount after discount (required),
  "currency": "USD/EUR/PLN/etc",
  "paymentMethod": "cash/card/etc or null",
  "suggestedCategory": "best matching category from the available list",
  "confidence": 0-1 confidence score,
  "rawText": "all readable text from receipt"
}

Item name normalization rules for the "description" field:
- IMPORTANT: Preserve the actual product name from the receipt — do NOT replace it with a different brand or product
- Separate concatenated words with spaces (e.g. "PiwoZywiec0.5" -> "Piwo Zywiec 0.5L")
- Use proper capitalization for the words as printed on receipt (e.g. "coca cola" -> "Coca-Cola")
- Remove store-specific product codes, PLU numbers, and internal IDs
- Include size/weight/volume when present (e.g. "0.5L", "500g", "1kg")
- Keep the product name in the original receipt language
- Only fix obvious single-character OCR errors within the same word, do NOT guess or substitute brand names

Discount extraction:
- Look for lines like "DISCOUNT", "RABAT", "СКИДКА", "ЗНИЖКА", "SAVINGS", "SALE", percentage-off amounts
- Sum all discount lines into one total discount value
- If no discount found, set discount to null
- The total should be the final amount AFTER discount

Important:
- Extract EVERY line item if possible
- If currency symbol is not clear, guess based on merchant location/language
- Total is required - estimate from items if not clearly visible
- Be thorough but fast
- Only return valid JSON, no other text`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed: ParsedReceipt & { suggestedCategory?: string } =
      JSON.parse(content);

    // Find matching category
    const matchedCategory = categories.find(
      (c: CategoryWithName) => c.name.toLowerCase() === parsed.suggestedCategory?.toLowerCase(),
    );

    // Generate description from items or merchant
    let description = '';
    if (parsed.items && parsed.items.length > 0) {
      if (parsed.items.length === 1) {
        description = parsed.items[0].description;
      } else {
        description = `${parsed.merchantName || 'Purchase'} (${parsed.items.length} items)`;
      }
    } else if (parsed.merchantName) {
      description = `Purchase at ${parsed.merchantName}`;
    } else {
      description = 'Receipt expense';
    }

    return {
      amount: parsed.total || 0,
      discountAmount: parsed.discount || null,
      currencyCode: parsed.currency || 'USD',
      description,
      categoryId: matchedCategory?.id || null,
      categorySuggestion: parsed.suggestedCategory || null,
      merchant: parsed.merchantName,
      date: parsed.date,
      confidence: parsed.confidence || 0.7,
      receiptItems: parsed.items || [],
    };
  }

  async extractTextFromImage(imageBase64: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract and return ALL text visible in this image. Return plain text only, preserving the layout as much as possible.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    });

    return response.choices[0]?.message?.content || '';
  }
}
