import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { BulkUpdateExpensesDto } from './dto';
import { invalidateExpenseChatCache } from './expense-cache.util';
import { resolveExpenseCategoryId } from './expense-category-resolver.util';

/**
 * Bulk expense mutations (multi-select category/tag/delete from the mobile
 * expenses tab). Extracted out of ExpensesService (see
 * docs/tech-debt/expenses-service-god-file.md) — bulkUpdate never needed any
 * of the create/update fire-and-forget hooks (anomaly, family-feed, etc.),
 * only PrismaService and cache invalidation.
 */
@Injectable()
export class ExpenseBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async bulkUpdate(accountId: string, dto: BulkUpdateExpensesDto): Promise<{ updated: number }> {
    const { ids, categoryId, tagIds, isDeleted } = dto;

    // IDs from the mobile client may be server PKs OR local clientIds (offline-first).
    // Resolve against both — mirrors findOne()'s `OR: [{ id }, { clientId: id }]`.
    // Matching only on `id` silently no-ops bulk delete/update for every synced expense.
    const owned = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id: { in: ids } }, { clientId: { in: ids } }],
      },
      select: { id: true },
    });
    const ownedIds = owned.map((e) => e.id);
    if (ownedIds.length === 0) return { updated: 0 };

    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };

    if (isDeleted === true) {
      updateData.isDeleted = true;
    } else {
      if (categoryId !== undefined) {
        if (categoryId === null) {
          updateData.categoryId = null;
        } else {
          const resolved = await resolveExpenseCategoryId(this.prisma, categoryId, accountId);
          updateData.categoryId = resolved;
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.expense.updateMany({
        where: { id: { in: ownedIds }, accountId },
        data: updateData,
      });

      if (!isDeleted && tagIds !== undefined && tagIds.length > 0) {
        // tagIds may be server PKs or mobile clientIds — resolve both.
        const validTags = await tx.tag.findMany({
          where: { accountId, OR: [{ id: { in: tagIds } }, { clientId: { in: tagIds } }] },
          select: { id: true },
        });
        const validTagIds = validTags.map((t) => t.id);

        for (const expenseId of ownedIds) {
          for (const tagId of validTagIds) {
            await tx.expenseTag.upsert({
              where: { expenseId_tagId: { expenseId, tagId } },
              create: { expenseId, tagId },
              update: {},
            });
          }
        }
      }
    });

    await invalidateExpenseChatCache(this.cacheService, accountId);
    return { updated: ownedIds.length };
  }
}
