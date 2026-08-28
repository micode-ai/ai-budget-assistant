import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * The rule key: everything that is not a letter or a digit is layout, not
 * identity.
 *
 * `trim().toLowerCase()` was too literal to survive two readings of the same
 * receipt. One Biedronka receipt scanned on consecutive days taught 22 rules on
 * day one and 33 more on day two **without a single key in common** — the cache
 * never hit, the model re-decided every line, and contradictory pairs piled up
 * (`piwo carlsberg 0,5l` → Piwo beside `carlsberg 0,5l` → Groceries). The
 * feature's whole premise, that a repeat purchase costs nothing, was dead.
 *
 * What actually varied: an OCR-dropped diacritic (`MasłExtra` / `MaslExtra`),
 * the printer's erratic spacing (`BurakiGotowane500 g`, `Par  Z Szynki`), and a
 * decimal comma against a dot. None of those is a different product, so none of
 * them survives normalization.
 *
 * `\p{L}` rather than `a-z`: a Cyrillic receipt line must not normalize to the
 * empty string, which would silently disable rule learning for every RU/UA user.
 * `ł` is handled explicitly because it is the one Polish letter NFD does not
 * decompose — and the one the OCR actually dropped.
 */
export function normalizeProductName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Learned product → category rules, the sibling of MerchantRulesService.
 *
 * Two writers: a successful LLM classification (so a repeat purchase costs
 * nothing) and a user correction (which simply overwrites, so the user always
 * wins over the model).
 */
@Injectable()
export class ProductRulesService {
  private readonly logger = new Logger(ProductRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getRulesMap(accountId: string): Promise<Map<string, string>> {
    const rules: Array<{ canonicalNameNormalized: string; categoryId: string }> =
      await (this.prisma as any).productCategoryRule.findMany({
        where: { accountId },
        select: { canonicalNameNormalized: true, categoryId: true },
      });
    return new Map(rules.map((r) => [r.canonicalNameNormalized, r.categoryId]));
  }

  /**
   * Never throws: rule learning is a background nicety, and losing it must not
   * fail the write that triggered it.
   */
  async upsertRules(
    accountId: string,
    rules: Array<{ ruleKey: string; categoryId: string }>,
  ): Promise<void> {
    for (const rule of rules) {
      // The stored column keeps its name; what goes into it is now the
      // receipt's printed line rather than the model's invented canonical name.
      const canonicalNameNormalized = normalizeProductName(rule.ruleKey ?? '');
      if (!canonicalNameNormalized || !rule.categoryId) continue;
      try {
        await (this.prisma as any).productCategoryRule.upsert({
          where: { accountId_canonicalNameNormalized: { accountId, canonicalNameNormalized } },
          create: { accountId, canonicalNameNormalized, categoryId: rule.categoryId },
          update: { categoryId: rule.categoryId },
        });
      } catch (error) {
        this.logger.warn(`[ProductRules] upsert skipped for "${canonicalNameNormalized}": ${error}`);
      }
    }
  }
}
