import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RECENTLY_DELETED_RETENTION_DAYS, retentionCutoff } from './recently-deleted.constants';
import { RestoreItemDto } from './dto';

export type RestoreBlockReason = 'not_found' | 'expired' | 'debt_deleted' | 'transfer_deleted';

export interface RestoreResult {
  restored: { entityType: 'expense' | 'income'; id: string }[];
  skipped: { entityType: 'expense' | 'income'; id: string; reason: RestoreBlockReason }[];
}

/**
 * Soft-deleted rows have no `deletedAt` column: `updatedAt` is the deletion time, because
 * every delete path bumps it and a deleted row is never edited afterwards. A 30-day window
 * therefore needs no migration.
 */
@Injectable()
export class RecentlyDeletedService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string, limit = 100) {
    const since = retentionCutoff();
    const take = Math.min(Math.max(limit, 1), 200);
    const where = { accountId, isDeleted: true, updatedAt: { gte: since } };
    const [expenses, incomes] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true, clientId: true, amount: true, currencyCode: true, description: true,
          merchant: true, date: true, categoryId: true, isDebt: true, isDebtRepayment: true,
          isSplitReceivable: true, encryptedPayload: true, updatedAt: true,
        },
      }),
      this.prisma.income.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true, clientId: true, amount: true, currencyCode: true, description: true,
          date: true, categoryId: true, isDebt: true, isDebtRepayment: true,
          encryptedPayload: true, updatedAt: true,
        },
      }),
    ]);
    const rows = [
      ...expenses.map(e => ({ entityType: 'expense' as const, ...e, deletedAt: e.updatedAt })),
      ...incomes.map(i => ({ entityType: 'income' as const, ...i, deletedAt: i.updatedAt })),
    ]
      .sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime())
      .slice(0, take);
    return { data: rows, retentionDays: RECENTLY_DELETED_RETENTION_DAYS };
  }

  async restore(accountId: string, items: RestoreItemDto[]): Promise<RestoreResult> {
    const result: RestoreResult = { restored: [], skipped: [] };
    const since = retentionCutoff();
    for (const item of items) {
      const reason = await this.restoreOne(accountId, item, since);
      if (reason) result.skipped.push({ entityType: item.entityType, id: item.id, reason });
      else result.restored.push({ entityType: item.entityType, id: item.id });
    }
    return result;
  }

  private async restoreOne(accountId: string, item: RestoreItemDto, since: Date): Promise<RestoreBlockReason | null> {
    // Every id resolves as OR:[{id},{clientId}] — device-created rows are addressed by clientId.
    const where = { accountId, isDeleted: true, OR: [{ id: item.id }, { clientId: item.id }] };
    if (item.entityType === 'expense') {
      const row = await this.prisma.expense.findFirst({
        where,
        select: { id: true, updatedAt: true, relatedDebtIncomeId: true },
      });
      if (!row) return 'not_found';
      if (row.updatedAt < since) return 'expired';
      if (row.relatedDebtIncomeId) {
        // A repayment must not outlive its debt: it would count against a debt that no longer exists.
        const debt = await this.prisma.income.findFirst({
          where: { accountId, id: row.relatedDebtIncomeId, isDeleted: true },
          select: { id: true },
        });
        if (debt) return 'debt_deleted';
      }
      // Use the RESOLVED server PK, never the raw id.
      await this.prisma.expense.update({
        where: { id: row.id },
        data: { isDeleted: false, syncVersion: { increment: 1 } },
      });
      return null;
    }
    const row = await this.prisma.income.findFirst({
      where,
      select: { id: true, updatedAt: true, relatedDebtExpenseId: true },
    });
    if (!row) return 'not_found';
    if (row.updatedAt < since) return 'expired';
    // The income is the receiving leg of a transfer: reviving it alone would leave a deleted transfer
    // with a live income (a phantom credit).
    const transfer = await this.prisma.accountTransfer.findFirst({
      where: { linkedIncomeId: row.id, isDeleted: true },
      select: { id: true },
    });
    if (transfer) return 'transfer_deleted';
    if (row.relatedDebtExpenseId) {
      const debt = await this.prisma.expense.findFirst({
        where: { accountId, id: row.relatedDebtExpenseId, isDeleted: true },
        select: { id: true },
      });
      if (debt) return 'debt_deleted';
    }
    await this.prisma.income.update({
      where: { id: row.id },
      data: { isDeleted: false, syncVersion: { increment: 1 } },
    });
    return null;
  }
}
