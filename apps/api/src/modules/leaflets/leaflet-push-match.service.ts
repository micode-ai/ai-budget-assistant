import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { logCacheUsage } from '../ai/utils/log-cache-usage';
import { sanitizeForPrompt } from '../ai/utils/sanitize';
import type { BasketProduct } from './leaflet-basket.util';
import type { ConfirmedPromo } from './community-promo.service';

// A text-only pairing of two short lists — the cheap model is enough. This call is a server cost of
// the community push and is never charged to any user's AI or leaflet budget.
const MATCH_MODEL = 'gpt-4.1-mini';

export interface PromoBasketPair {
  promoIndex: number;
  basketName: string;
}

const MATCH_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'promo_basket_pairs',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['pairs'],
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['promoIndex', 'basketIndex'],
            properties: {
              promoIndex: { type: 'integer' },
              basketIndex: { type: 'integer' },
            },
          },
        },
      },
    },
  },
};

/**
 * Prompt for the closed-set pairing. It sees only NAMES (and the promo's chain) as two numbered
 * lists — never prices, so it can neither be anchored by nor leak what the user pays.
 */
export function buildPushMatchPrompt(basket: BasketProduct[], promos: ConfirmedPromo[]): string {
  const basketList = basket.map((b, i) => `${i}: ${sanitizeForPrompt(b.name, 120)}`).join('\n');
  const promoList = promos
    .map((p, i) => `${i}: ${sanitizeForPrompt(p.canonicalName, 120)} (${sanitizeForPrompt(p.chain, 64)})`)
    .join('\n');
  return `Pair supermarket promotions with the user's usual products.

Promotions (number: product (store)):
${promoList}

The user's products (number: product):
${basketList}

Return "pairs": one { "promoIndex", "basketIndex" } for each promotion that is the SAME product as one of the user's products:
- same product type;
- same brand when the user's product names a brand;
- pack size must match when both sides state one (200g butter is not 400g butter);
- when unsure, leave the promotion out. A missed pair is acceptable, a wrong one is not.
Use each number of each list at most once. Only use numbers from the lists. Return an empty "pairs" array when nothing matches.`;
}

/** Closed-set pairing of confirmed community promos with a user's usual basket — one text call. */
@Injectable()
export class LeafletPushMatchService {
  private readonly logger = new Logger(LeafletPushMatchService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });
  }

  /** Model failure or malformed output → [] (never "everything"). */
  async match(basket: BasketProduct[], promos: ConfirmedPromo[]): Promise<PromoBasketPair[]> {
    if (basket.length === 0 || promos.length === 0) return [];
    let parsed: unknown;
    try {
      const response = await this.openai.chat.completions.create({
        model: MATCH_MODEL,
        messages: [{ role: 'user', content: buildPushMatchPrompt(basket, promos) }],
        max_tokens: 1000,
        temperature: 0,
        response_format: MATCH_FORMAT,
      });
      logCacheUsage(this.logger, 'leaflet-push-match', response.usage);
      parsed = JSON.parse(response.choices[0]?.message?.content ?? '');
    } catch (e) {
      this.logger.warn(`[LeafletPush] match failed: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }

    const pairs = (parsed as { pairs?: unknown } | null)?.pairs;
    if (!Array.isArray(pairs)) return [];
    const usedPromos = new Set<number>();
    const usedBasket = new Set<number>();
    const out: PromoBasketPair[] = [];
    for (const pair of pairs) {
      if (!pair || typeof pair !== 'object') continue;
      const { promoIndex, basketIndex } = pair as { promoIndex?: unknown; basketIndex?: unknown };
      // Both halves are checked before either is marked used, so a bad half never burns a good index.
      if (!isFreeIndex(promoIndex, promos.length, usedPromos) || !isFreeIndex(basketIndex, basket.length, usedBasket)) {
        continue;
      }
      usedPromos.add(promoIndex);
      usedBasket.add(basketIndex);
      out.push({ promoIndex, basketName: basket[basketIndex].name });
    }
    return out;
  }
}

/** An integer in [0, length) not used yet. Anything else is dropped, never guessed. */
function isFreeIndex(index: unknown, length: number, used: Set<number>): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < length && !used.has(index);
}
