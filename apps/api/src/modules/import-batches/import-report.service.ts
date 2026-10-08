import { Injectable, NotFoundException } from '@nestjs/common';
import type { ImportReportResponse } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { getRatesSafe } from '../../common/utils/fx';
import { normalizeMerchant } from '../anomaly/anomaly-helpers.util';
import { buildImportReport } from './import-report.util';

/**
 * The instant report shown right after an import (ABA-643): IO only — the decisions live in the
 * pure `buildImportReport`. Kept apart from `ImportBatchesService` so the import modules that inject
 * that service do not inherit an FX dependency.
 */
@Injectable()
export class ImportReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async getReport(accountId: string, baseCurrency: string, batchId: string): Promise<ImportReportResponse> {
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, accountId }, select: { id: true } });
    if (!batch) throw new NotFoundException('Import batch not found');

    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { encryptionTier: true } });
    const encrypted = (account?.encryptionTier ?? 0) >= 2; // amounts are ciphertext on the server

    const [expenses, incomes, subs, budgeted, rates] = await Promise.all([
      encrypted
        ? Promise.resolve([])
        : this.prisma.expense.findMany({
            where: { accountId, importBatchId: batchId, isDeleted: false },
            select: {
              id: true,
              amount: true,
              currencyCode: true,
              date: true,
              merchant: true,
              description: true,
              categoryId: true,
              category: { select: { name: true, color: true } },
            },
          }),
      encrypted
        ? Promise.resolve([])
        : this.prisma.income.findMany({
            where: { accountId, importBatchId: batchId, isDeleted: false },
            select: { amount: true, currencyCode: true },
          }),
      this.prisma.userSubscription.findMany({ where: { accountId, isActive: true }, select: { name: true } }),
      this.prisma.budgetCategory.findMany({
        where: { isDeleted: false, budget: { accountId, isActive: true, isDeleted: false } },
        select: { categoryId: true },
      }),
      getRatesSafe(this.exchangeRateService, baseCurrency),
    ]);

    return buildImportReport({
      batchId,
      baseCurrency,
      expenses: expenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        currencyCode: e.currencyCode || baseCurrency,
        date: e.date,
        merchant: e.merchant ?? null,
        description: e.description ?? null,
        categoryId: e.categoryId ?? null,
        categoryName: e.category?.name ?? null,
        categoryColor: e.category?.color ?? null,
      })),
      incomes: incomes.map((i) => ({ amount: Number(i.amount), currencyCode: i.currencyCode || baseCurrency })),
      rates,
      trackedSubscriptionNames: new Set(subs.map((s) => normalizeMerchant(s.name))),
      budgetedCategoryIds: new Set(budgeted.map((b) => b.categoryId)),
    });
  }
}
