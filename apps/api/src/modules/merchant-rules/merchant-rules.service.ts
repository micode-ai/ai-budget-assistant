import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MerchantCategoryRuleResponse } from './dto';

@Injectable()
export class MerchantRulesService {
  constructor(private readonly prisma: PrismaService) {}

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
    const rule: { accountId: string } | null =
      await (this.prisma as any).merchantCategoryRule.findUnique({ where: { id } });
    if (!rule || rule.accountId !== accountId) throw new NotFoundException('Rule not found');
    await (this.prisma as any).merchantCategoryRule.delete({ where: { id } });
  }
}
