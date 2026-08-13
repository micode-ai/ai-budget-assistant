import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/** The rule key. Mirrors `merchantNormalized` in MerchantRulesService. */
export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
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
    rules: Array<{ canonicalName: string; categoryId: string }>,
  ): Promise<void> {
    for (const rule of rules) {
      const canonicalNameNormalized = normalizeProductName(rule.canonicalName ?? '');
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
