import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { ImportBatchListResponse, RollbackImportBatchResponse } from '@budget/shared-types';

const ROLLBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class ImportBatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string): Promise<ImportBatchListResponse> {
    const batches = await this.prisma.importBatch.findMany({
      where: { accountId },
      orderBy: { importedAt: 'desc' },
      take: 20,
    });

    const cutoff = new Date(Date.now() - ROLLBACK_WINDOW_MS);

    return {
      batches: batches.map((b) => ({
        id: b.id,
        source: b.source,
        importedAt: b.importedAt.toISOString(),
        rowCount: b.rowCount,
        status: b.status as 'committed' | 'rolled_back',
        canRollback: b.status === 'committed' && b.importedAt >= cutoff,
      })),
    };
  }

  async rollback(accountId: string, batchId: string): Promise<RollbackImportBatchResponse> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, accountId },
    });

    if (!batch) throw new NotFoundException('Import batch not found');
    if (batch.status === 'rolled_back') throw new ForbiddenException('Already rolled back');

    const cutoff = new Date(Date.now() - ROLLBACK_WINDOW_MS);
    if (batch.importedAt < cutoff) {
      throw new ForbiddenException('Rollback window expired (30 days)');
    }

    // Soft-delete all transactions and NULL out externalRef so re-import works cleanly
    const [expenses, incomes, exchanges] = await this.prisma.$transaction([
      this.prisma.expense.updateMany({
        where: { importBatchId: batchId, accountId },
        data: { isDeleted: true, externalRef: null },
      }),
      this.prisma.income.updateMany({
        where: { importBatchId: batchId, accountId },
        data: { isDeleted: true, externalRef: null },
      }),
      this.prisma.currencyExchange.updateMany({
        where: { importBatchId: batchId, accountId },
        data: { isDeleted: true, externalRef: null },
      }),
    ]);

    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'rolled_back' },
    });

    return { rolledBack: expenses.count + incomes.count + exchanges.count };
  }

  async createBatch(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    data: { accountId: string; userId: string; source: string },
  ): Promise<string> {
    const batch = await tx.importBatch.create({
      data: {
        accountId: data.accountId,
        userId: data.userId,
        source: data.source,
        rowCount: 0,
        status: 'committed',
      },
    });
    return batch.id;
  }

  async finalizeBatch(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    batchId: string,
    rowCount: number,
  ): Promise<void> {
    await tx.importBatch.update({
      where: { id: batchId },
      data: { rowCount },
    });
  }
}
