import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { BulkUpdateIncomesDto } from './dto';
import { resolveExpenseCategoryId } from '../expenses/expense-category-resolver.util';

/**
 * Bulk income mutations — the income counterpart of ExpenseBulkService,
 * feeding the "categorize uncategorized" review's Apply step
 * (docs/contracts/categorize-uncategorized-incomes.md). v1 is category-only:
 * no tagIds/isDeleted (no IncomeTag junction writes needed here), and no
 * merchant-rule learning (income has no merchant field).
 */
@Injectable()
export class IncomeBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async bulkUpdate(accountId: string, dto: BulkUpdateIncomesDto): Promise<{ updated: number }> {
    const { ids, categoryId } = dto;

    // IDs from the mobile client may be server PKs OR local clientIds
    // (offline-first) — resolve against both, mirroring ExpenseBulkService
    // and IncomesService.findOne. Matching on `id` only silently no-ops the
    // whole bulk op for every synced (device-created) income.
    const owned = await this.prisma.income.findMany({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id: { in: ids } }, { clientId: { in: ids } }],
      },
      select: { id: true },
    });
    const ownedIds = owned.map((i) => i.id);
    if (ownedIds.length === 0) return { updated: 0 };

    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };

    if (categoryId !== undefined) {
      if (categoryId === null) {
        updateData.categoryId = null;
      } else {
        const resolved = await resolveExpenseCategoryId(this.prisma, categoryId, accountId, 'income');
        // Leave the field out entirely when it does not resolve, rather than
        // blanking the existing category of every selected row — same
        // defensive posture as ExpenseBulkService (ABA-566).
        if (resolved) updateData.categoryId = resolved;
      }
    }

    await this.prisma.income.updateMany({
      where: { id: { in: ownedIds }, accountId },
      data: updateData,
    });

    await this.cacheService.del(`uc:${accountId}`);

    return { updated: ownedIds.length };
  }
}
