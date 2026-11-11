import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CANONICAL_NAME_RULES } from '../ai/prompts/canonical-name-rules';
import { logCacheUsage } from '../ai/utils/log-cache-usage';
import { sanitizeForPrompt } from '../ai/utils/sanitize';
import type { BasketProduct } from './leaflet-basket.util';
import { LEAFLET_PAGE_FORMAT, normalizeLeafletPage, type NormalizedLeafletPage } from './leaflet-page.util';

// Same vision model as receipt OCR and price tags: leaflet digits are just as easy to misread.
const LEAFLET_MODEL = 'gpt-4.1';

/**
 * The prompt sees only the basket's NAMES as a numbered list — never what the user paid,
 * so the model cannot be anchored by (or leak) the user's price history.
 */
export function buildLeafletPrompt(basket: BasketProduct[], accountCurrency: string): string {
  const list = basket.map((b, i) => `${i}: ${sanitizeForPrompt(b.name, 120)}`).join('\n');
  return `You are reading one page of a supermarket promotional leaflet (gazetka).
Return:
- "chain": the store chain name as printed (e.g. "Biedronka", "Lidl"). null if not visible.
- "validFrom" / "validTo": the leaflet validity dates as printed (e.g. "10.11", "16.11.2026"). null if not visible.
- "items": every product offer on the page, each with:
  - "name": product name as printed, brand included.
  - "canonicalName": the product named by the rules below.
  - "promoPrice": the promotional price a shopper pays for one item, as a number (dot for decimals).
  - "regularPrice": the crossed-out regular price as a number when printed, else null.
  - "currencyCode": ISO 4217 code of the price (zł -> "PLN", € -> "EUR"); when no currency sign is printed, "${accountCurrency}".
  - "condition": a short condition when the price needs one (loyalty card or app, multi-buy like "2+1" or "przy zakupie 2 szt.", coupon), else null.
  - "validFrom" / "validTo": only when this item's validity differs from the leaflet's, else null.
  - "basketIndex": the number of the matching product in the user's list below, or null.

${CANONICAL_NAME_RULES}

The user's list (number: product):
${list}

Matching rule for "basketIndex" — a match means the offer is the SAME product as that list entry:
- same product type;
- same brand when the list entry names a brand;
- pack size must match when both sides state one (200g butter is not 400g butter);
- when unsure, use null. A missed match is acceptable, a wrong one is not.
Use each number at most once. Only return a number from the list, never a new product.
Never invent a value: if something is not visible, use null. If the page is not a leaflet, return an empty "items" array.`;
}

/** Reads one leaflet page with one vision call. Output is untrusted and normalized. */
@Injectable()
export class LeafletReaderService {
  private readonly logger = new Logger(LeafletReaderService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  async readPage(
    imageBase64: string,
    mimeType: string,
    basket: BasketProduct[],
    accountCurrency: string,
  ): Promise<NormalizedLeafletPage> {
    const type = /^image\/(png|jpeg|jpg|webp)$/.test(mimeType) ? mimeType : 'image/jpeg';
    const response = await this.openai.chat.completions.create({
      model: LEAFLET_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildLeafletPrompt(basket, accountCurrency) },
            { type: 'image_url', image_url: { url: `data:${type};base64,${imageBase64}`, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0,
      response_format: LEAFLET_PAGE_FORMAT,
    });
    logCacheUsage(this.logger, 'leaflet', response.usage);

    const content = response.choices[0]?.message?.content ?? '';
    try {
      return normalizeLeafletPage(JSON.parse(content), basket.length, new Date());
    } catch {
      this.logger.warn('[Leaflet] Model returned non-JSON content');
      return normalizeLeafletPage(null, basket.length, new Date());
    }
  }
}
