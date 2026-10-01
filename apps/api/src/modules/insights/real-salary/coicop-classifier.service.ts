import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CHEAP_MODEL } from '../../ai/services/model-resolver';
import { logCacheUsage } from '../../ai/utils/log-cache-usage';
import { DIVISIONS, divisionForSeedIcon, isDivision } from './coicop';

export const CLASSIFY_BATCH = 50;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenAILike = { chat: { completions: { create(args: any): Promise<any> } } };

/**
 * Completion budget per answered category. A pretty-printed pair
 * `  "49": "CP09",` is ~8 tokens; a flat 400-token cap truncated a full
 * 50-item batch mid-JSON, the parse failed, nothing was stored, and the same
 * batch was re-asked — and truncated again — on every request (ABA-617).
 */
export const TOKENS_PER_CATEGORY = 12;
const TOKENS_OVERHEAD = 30;

/**
 * Strict schema for one batch: one property per index "0".."count-1", each an
 * enum of the COICOP divisions. The index set is known at request time, so the
 * object stays fully specified; the stored-answer guard (`isDivision`) remains.
 */
export function buildCoicopFormat(count: number) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (let i = 0; i < count; i++) {
    properties[String(i)] = { type: 'string', enum: [...DIVISIONS] };
    required.push(String(i));
  }
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'coicop_divisions',
      strict: true,
      schema: { type: 'object', additionalProperties: false, required, properties },
    },
  };
}

export function completionBudget(count: number): number {
  return TOKENS_OVERHEAD + count * TOKENS_PER_CATEGORY;
}

const SYSTEM = `You map personal-finance expense category names to COICOP 2018 divisions.
Names may be in any language (Polish, Russian, Ukrainian, Belarusian, German, English, Dutch,
French, Spanish...). Map each given index to one code from:
${DIVISIONS.join(', ')}.
CP01 food & non-alcoholic drinks, groceries, supermarket.
CP02 alcohol & tobacco.
CP03 clothing & footwear.
CP04 housing: rent, utilities, electricity, gas, water, heating, repairs of the dwelling.
CP05 furnishings & household: furniture, appliances, home goods, shopping for the home, cleaning supplies, garden.
CP06 health: pharmacy, medicine, doctor, dentist, optician.
CP07 transport: fuel, car, parking, taxi, public transport, tickets, car service.
CP08 phone, internet & digital subscriptions: mobile plan, streaming, apps, software subscriptions.
CP09 recreation, culture & holidays: entertainment, hobbies, sport, gym, games, books, cinema, concerts,
     pets & pet food, toys, gifts, flowers, travel & holidays, package tours.
CP10 education: school, university, courses, tutoring.
CP11 restaurants & accommodation: restaurants, cafes, bars, takeaway, food delivery, hotels.
CP12 insurance & financial services: insurance, bank fees, commissions.
CP13 personal care & miscellaneous: beauty, cosmetics, hairdresser, barber, hygiene, kids' care and
     childcare, jewellery, other personal items.
Use TOTAL only when the name is a person's name (a family member, a friend), a pet's own name,
or a genuinely mixed or unknown category ("Other", "Misc", "Various", "Cash"). A generic name that
points at one kind of spending always gets that division, never TOTAL.
Examples: "Entertainment" → CP09, "Rozrywka" → CP09, "Развлечения" → CP09, "Розваги" → CP09,
"Freizeit" → CP09, "Sport" → CP09, "Подарки" → CP09, "Prezenty" → CP09, "Podróże" → CP09,
"Urlaub" → CP09, "Zwierzęta" → CP09, "Subskrypcje" → CP08, "Подписки" → CP08, "Abos" → CP08,
"Dom" → CP05, "Для дома" → CP05, "Haushalt" → CP05, "Uroda" → CP13, "Красота" → CP13,
"Dzieci" → CP13, "Дети" → CP13, "Kinder" → CP13, "Anna" → TOTAL, "Мама" → TOTAL,
"Burek" → TOTAL, "Inne" → TOTAL, "Разное" → TOTAL, "Sonstiges" → TOTAL.`;

/**
 * Gives each expense category a COICOP division once. Seed categories are
 * mapped by icon; the rest by a cheap model that sees ONLY the names. Every
 * answer is stored — an invalid or missing one as TOTAL — so a category is asked
 * about at most once; a failed call leaves it null to retry on the next request.
 * Not charged to the user's AI limit: one tiny call per account, ever.
 */
@Injectable()
export class CoicopClassifierService {
  private readonly logger = new Logger(CoicopClassifierService.name);
  private readonly openai: OpenAILike | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Optional() openai?: OpenAILike | null,
  ) {
    const key = config.get<string>('OPENAI_API_KEY');
    this.openai = openai ?? (key ? (new OpenAI({ apiKey: key, timeout: 10_000, maxRetries: 0 }) as unknown as OpenAILike) : null);
  }

  async ensureClassified(accountId: string): Promise<void> {
    try {
      const cats = await this.prisma.category.findMany({
        where: { accountId, type: 'expense', isDeleted: false, coicopDivision: null },
        select: { id: true, name: true, icon: true },
        take: CLASSIFY_BATCH,
      });
      const rest: { id: string; name: string }[] = [];
      for (const c of cats) {
        const d = divisionForSeedIcon(c.icon);
        if (d) await this.prisma.category.update({ where: { id: c.id }, data: { coicopDivision: d, coicopSource: 'seed' } });
        else rest.push(c);
      }
      if (rest.length === 0 || !this.openai) return;

      let answer: Record<string, unknown>;
      try {
        const res = await this.openai.chat.completions.create({
          model: CHEAP_MODEL,
          temperature: 0,
          max_tokens: completionBudget(rest.length),
          response_format: buildCoicopFormat(rest.length),
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: rest.map((c, i) => `${i}: ${c.name}`).join('\n') },
          ],
        });
        logCacheUsage(this.logger, 'coicop-classifier', res.usage);
        answer = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
      } catch (e) {
        this.logger.warn(`COICOP classification failed, will retry: ${String(e)}`);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        const v = answer[String(i)];
        await this.prisma.category.update({
          where: { id: rest[i].id },
          data: { coicopDivision: isDivision(v) ? v : 'TOTAL', coicopSource: 'model' },
        });
      }
    } catch (e) {
      this.logger.warn(`COICOP classification skipped: ${String(e)}`);
    }
  }
}
