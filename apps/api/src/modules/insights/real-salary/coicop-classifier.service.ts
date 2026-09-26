import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CHEAP_MODEL } from '../../ai/services/model-resolver';
import { DIVISIONS, divisionForSeedIcon, isDivision } from './coicop';

export const CLASSIFY_BATCH = 50;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenAILike = { chat: { completions: { create(args: any): Promise<any> } } };

const SYSTEM = `You map personal-finance expense category names to COICOP 2018 divisions.
Answer with a JSON object mapping each given index to one code from:
${DIVISIONS.join(', ')}.
CP01 food & non-alcoholic drinks, CP02 alcohol & tobacco, CP03 clothing & footwear,
CP04 housing, rent & utilities, CP05 furnishings & household, CP06 health, CP07 transport,
CP08 phone, internet & digital subscriptions, CP09 recreation, culture & holidays,
CP10 education, CP11 restaurants & accommodation, CP12 insurance & financial services,
CP13 personal care & miscellaneous. Use TOTAL when a name fits no single division.`;

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
    this.openai = openai ?? (key ? (new OpenAI({ apiKey: key }) as unknown as OpenAILike) : null);
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
        if (d) await this.prisma.category.update({ where: { id: c.id }, data: { coicopDivision: d } });
        else rest.push(c);
      }
      if (rest.length === 0 || !this.openai) return;

      let answer: Record<string, unknown>;
      try {
        const res = await this.openai.chat.completions.create({
          model: CHEAP_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: rest.map((c, i) => `${i}: ${c.name}`).join('\n') },
          ],
        });
        answer = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
      } catch (e) {
        this.logger.warn(`COICOP classification failed, will retry: ${String(e)}`);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        const v = answer[String(i)];
        await this.prisma.category.update({
          where: { id: rest[i].id },
          data: { coicopDivision: isDivision(v) ? v : 'TOTAL' },
        });
      }
    } catch (e) {
      this.logger.warn(`COICOP classification skipped: ${String(e)}`);
    }
  }
}
