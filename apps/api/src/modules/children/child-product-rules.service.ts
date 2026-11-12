import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { normalizeProductName } from '../merchant-rules/product-rules.service';

/**
 * Learned product → child suggestions (`ProductChildRule`), the child-costs
 * sibling of `ProductRulesService`. Server-only: written when a user attributes
 * a receipt line to a child, read back as a SUGGESTION for the next scan — never
 * applied silently. Keyed by `normalizeProductName`, the same key the product
 * category rules use, so both survive OCR spacing and dropped diacritics alike.
 *
 * Nothing here logs a product key or a child: a rule ties a purchase to a minor.
 */
@Injectable()
export class ChildProductRulesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Last attribution wins. Throws on a DB error — callers run it fire-and-forget. */
  async learn(accountId: string, productName: string | null | undefined, childId: string): Promise<void> {
    const productKey = normalizeProductName(productName ?? '');
    if (!productKey || !childId) return;
    await this.prisma.productChildRule.upsert({
      where: { accountId_productKey: { accountId, productKey } },
      create: { accountId, productKey, childId },
      update: { childId },
    });
  }

  /**
   * `productKey → childId` for the given product names, keyed by the NORMALIZED
   * name. A rule pointing at an archived or deleted child is not offered.
   */
  async suggest(accountId: string, names: string[]): Promise<Record<string, string>> {
    const keys = Array.from(new Set(names.map((n) => normalizeProductName(n ?? '')).filter((k) => k.length > 0)));
    if (keys.length === 0) return {};
    const rules = await this.prisma.productChildRule.findMany({
      where: { accountId, productKey: { in: keys }, child: { isDeleted: false, archivedAt: null } },
      select: { productKey: true, childId: true },
    });
    const out: Record<string, string> = {};
    for (const r of rules) out[r.productKey] = r.childId;
    return out;
  }
}
