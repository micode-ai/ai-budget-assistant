import { Injectable, NotFoundException } from '@nestjs/common';
import type { MerchantRuleReapplyGroup, MerchantRuleReapplyPreview } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { invalidateExpenseChatCache } from '../expenses/expense-cache.util';
import { MerchantCategoryRuleResponse } from './dto';

interface OwnedMerchantRule {
  id: string;
  accountId: string;
  merchantNormalized: string;
  categoryId: string;
  category: { name: string };
}

@Injectable()
export class MerchantRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async upsertRule(accountId: string, merchantNormalized: string, categoryId: string): Promise<void> {
    await (this.prisma as any).merchantCategoryRule.upsert({
      where: { accountId_merchantNormalized: { accountId, merchantNormalized } },
      create: { accountId, merchantNormalized, categoryId },
      update: { categoryId },
    });
  }

  async getRulesMap(accountId: string): Promise<Map<string, string>> {
    const rules: Array<{ merchantNormalized: string; categoryId: string }> =
      await (this.prisma as any).merchantCategoryRule.findMany({
        where: { accountId },
        select: { merchantNormalized: true, categoryId: true },
      });
    return new Map(rules.map((r) => [r.merchantNormalized, r.categoryId]));
  }

  async listRules(accountId: string): Promise<MerchantCategoryRuleResponse[]> {
    const rules: Array<{
      id: string;
      merchantNormalized: string;
      categoryId: string;
      createdAt: Date;
      updatedAt: Date;
      category: { name: string; icon: string | null };
    }> = await (this.prisma as any).merchantCategoryRule.findMany({
      where: { accountId },
      include: { category: { select: { name: true, icon: true } } },
      orderBy: { merchantNormalized: 'asc' },
    });
    return rules.map((r) => ({
      id: r.id,
      merchantNormalized: r.merchantNormalized,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      categoryIcon: r.category.icon ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async deleteRule(accountId: string, id: string): Promise<void> {
    await this.getOwnedRule(accountId, id);
    await (this.prisma as any).merchantCategoryRule.delete({ where: { id } });
  }

  /** Resolves a rule owned by this account, selecting the fields `reapply*` needs. */
  private async getOwnedRule(accountId: string, id: string): Promise<OwnedMerchantRule> {
    const rule: OwnedMerchantRule | null = await (this.prisma as any).merchantCategoryRule.findUnique({
      where: { id },
      select: {
        id: true,
        accountId: true,
        merchantNormalized: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });
    if (!rule || rule.accountId !== accountId) throw new NotFoundException('Rule not found');
    return rule;
  }

  async previewReapply(accountId: string, ruleId: string): Promise<MerchantRuleReapplyPreview> {
    const rule = await this.getOwnedRule(accountId, ruleId);

    const expenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        isDebt: false,
        encryptedPayload: null,
        merchant: { equals: rule.merchantNormalized, mode: 'insensitive' },
        categoryId: { not: null },
      },
      select: { categoryId: true, category: { select: { name: true } } },
    });

    const groupsByCategoryId = new Map<string, MerchantRuleReapplyGroup>();
    for (const expense of expenses) {
      if (!expense.categoryId || expense.categoryId === rule.categoryId) continue;
      const existing = groupsByCategoryId.get(expense.categoryId);
      if (existing) {
        existing.count += 1;
      } else {
        groupsByCategoryId.set(expense.categoryId, {
          categoryId: expense.categoryId,
          categoryName: expense.category?.name ?? '',
          count: 1,
        });
      }
    }
    const groups = Array.from(groupsByCategoryId.values()).sort((a, b) => b.count - a.count);
    const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

    return {
      ruleId: rule.id,
      merchantNormalized: rule.merchantNormalized,
      targetCategoryId: rule.categoryId,
      targetCategoryName: rule.category.name,
      totalCount,
      groups,
    };
  }

  async reapply(accountId: string, ruleId: string, categoryIds: string[]): Promise<{ updated: number }> {
    const rule = await this.getOwnedRule(accountId, ruleId);

    // Defensive: never let the target category itself be treated as a source,
    // even if a stale/buggy client sends it.
    const allowed = new Set(categoryIds);
    allowed.delete(rule.categoryId);
    if (allowed.size === 0) return { updated: 0 };

    const rows = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        isDebt: false,
        encryptedPayload: null,
        merchant: { equals: rule.merchantNormalized, mode: 'insensitive' },
        categoryId: { in: [...allowed] },
      },
      select: { id: true },
    });
    if (rows.length === 0) return { updated: 0 };

    const ids = rows.map((r) => r.id);
    await this.prisma.expense.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: rule.categoryId, updatedAt: new Date() },
    });

    await invalidateExpenseChatCache(this.cacheService, accountId);

    return { updated: ids.length };
  }
}
