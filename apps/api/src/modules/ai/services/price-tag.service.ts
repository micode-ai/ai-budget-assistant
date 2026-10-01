import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import type { ScanPriceTagResponse } from '@budget/shared-types';
import { logCacheUsage } from '../utils/log-cache-usage';

// Same vision model as receipt OCR — a price tag is small, but its digits are
// just as easy to misread (a comma lost turns 4,99 into 499).
const PRICE_TAG_MODEL = 'gpt-4.1';

const EMPTY: ScanPriceTagResponse = {
  productName: null,
  price: null,
  currencyCode: null,
  size: null,
  unitPriceText: null,
  regularPrice: null,
  promoUntil: null,
  requiresLoyaltyCard: false,
};

const NULLABLE_STRING = { type: ['string', 'null'] } as const;
const NULLABLE_NUMBER = { type: ['number', 'null'] } as const;

/** Strict structured-output schema; `normalizePriceTag` stays as defence. */
export const PRICE_TAG_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'price_tag',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'productName', 'price', 'currencyCode', 'size', 'unitPriceText', 'regularPrice', 'promoUntil',
        'requiresLoyaltyCard',
      ],
      properties: {
        productName: NULLABLE_STRING,
        price: NULLABLE_NUMBER,
        currencyCode: NULLABLE_STRING,
        size: NULLABLE_STRING,
        unitPriceText: NULLABLE_STRING,
        regularPrice: NULLABLE_NUMBER,
        promoUntil: NULLABLE_STRING,
        requiresLoyaltyCard: { type: 'boolean' },
      },
    },
  },
};

function buildPrompt(accountCurrency: string): string {
  return `You are reading a photo of a shop shelf price tag (or a product with a price label).
Fill these fields:
- "productName": product name as printed, brand included, without the pack size. null if unreadable.
- "price": the price a shopper pays right now for one item, as a number (use a dot for decimals). When a promo price is shown next to a crossed-out regular price, this is the PROMO price. null if unreadable.
- "currencyCode": ISO 4217 code of that price (zł/PLN -> "PLN", € -> "EUR", $ -> "USD", £ -> "GBP", ₴ -> "UAH", ₽ -> "RUB", Br -> "BYN"). If the tag shows no currency sign, return "${accountCurrency}".
- "size": pack size exactly as printed, e.g. "500 g", "1 l", "6 x 0,5 l". null if absent.
- "unitPriceText": price per kg / l / piece exactly as printed, e.g. "9,98 zł/kg". null if absent.
- "regularPrice": the crossed-out regular price as a number, only when a promo is shown. null otherwise.
- "promoUntil": the promo end date exactly as printed, e.g. "05.10". null if absent.
- "requiresLoyaltyCard": true only if the tag says the price needs a loyalty card or app (e.g. "z kartą", "with app"); otherwise false.
Never invent a value: if something is not visible, use null.`;
}

function str(v: unknown, max = 120): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function money(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Turns the model's JSON into a safe response. Pure and exported for tests —
 * the model's output is untrusted: any field can be missing, mistyped or absurd.
 */
export function normalizePriceTag(raw: unknown): ScanPriceTagResponse {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const r = raw as Record<string, unknown>;
  const currency = str(r.currencyCode, 3)?.toUpperCase() ?? null;
  const price = money(r.price);
  const regular = money(r.regularPrice);
  return {
    productName: str(r.productName),
    price,
    currencyCode: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    size: str(r.size, 40),
    unitPriceText: str(r.unitPriceText, 40),
    // A "regular" price no higher than the current one is not a promo.
    regularPrice: regular != null && price != null && regular > price ? regular : null,
    promoUntil: str(r.promoUntil, 30),
    requiresLoyaltyCard: r.requiresLoyaltyCard === true,
  };
}

/**
 * Reads a shelf price tag photo for the shopping list: product, price and the
 * extras printed next to them. Read-only — it creates nothing; the client puts
 * the result into its item sheet for the user to confirm.
 */
@Injectable()
export class PriceTagService {
  private readonly logger = new Logger(PriceTagService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async scan(imageBase64: string, accountId: string, mimeType?: string): Promise<ScanPriceTagResponse> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { currencyCode: true } });
    const accountCurrency = account?.currencyCode ?? 'USD';
    const type = mimeType && /^image\/(png|jpeg|jpg|webp)$/.test(mimeType) ? mimeType : 'image/jpeg';

    const response = await this.openai.chat.completions.create({
      model: PRICE_TAG_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(accountCurrency) },
            { type: 'image_url', image_url: { url: `data:${type};base64,${imageBase64}`, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0,
      response_format: PRICE_TAG_FORMAT,
    });
    logCacheUsage(this.logger, 'price-tag', response.usage);

    const content = response.choices[0]?.message?.content ?? '';
    try {
      return normalizePriceTag(JSON.parse(content));
    } catch {
      this.logger.warn('[PriceTag] Model returned non-JSON content');
      return { ...EMPTY };
    }
  }
}
