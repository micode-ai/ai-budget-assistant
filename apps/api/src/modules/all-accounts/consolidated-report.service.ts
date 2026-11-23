import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CsvGenerator } from '../reports/generators/csv-generator';
import { ExcelGenerator } from '../reports/generators/excel-generator';
import { PdfGenerator } from '../reports/generators/pdf-generator';
import { AccountGroupsService } from './account-groups.service';
import { AllAccountsService } from './all-accounts.service';
import { aggregateLedger } from './all-accounts.util';
import { consolidatedLabels } from '../reports/generators/consolidated-labels';
import type { LedgerRow } from './all-accounts.types';
import type { ConsolidatedReportBody } from './dto/consolidated-report.dto';

const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One PDF/Excel/CSV across all (or a group's / a filtered set of) the caller's accounts.
 * Reuses the three existing generators through their additive optional fields. Every figure
 * comes from `aggregateLedger`, so the file can never disagree with the analytics screen;
 * rows carrying a note are listed but excluded from every total.
 */
@Injectable()
export class ConsolidatedReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allAccounts: AllAccountsService,
    private readonly groups: AccountGroupsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly csvGenerator: CsvGenerator,
    private readonly pdfGenerator: PdfGenerator,
    private readonly excelGenerator: ExcelGenerator,
  ) {}

  async generate(user: { id: string; currencyCode: string }, body: ConsolidatedReportBody) {
    const base = user.currencyCode || 'USD';
    let onlyAccountIds: string[] | null = null;
    if (body.groupId) {
      // Same refusal body as SubscriptionTierGuard for @RequireTier('pro').
      const sub = await this.subscriptions.getOrCreateSubscription(user.id);
      if (sub.tier !== 'pro' && sub.tier !== 'business') {
        throw new ForbiddenException({
          message: 'This feature requires a pro subscription or higher',
          requiredTier: 'pro',
          currentTier: sub.tier,
          code: 'TIER_REQUIRED',
        });
      }
      onlyAccountIds = await this.groups.resolveAccountIds(user.id, body.groupId);
    }

    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { language: true } });
    const language = (u as any)?.language || 'en';
    const exclude = body.exclude ?? [];
    const {
      accounts,
      includedIds,
      rows: allRows,
    } = await this.allAccounts.loadLedger(user.id, base, language, body.startDate, body.endDate, {
      exclude,
      onlyAccountIds,
    });
    if (includedIds.length === 0) throw new BadRequestException('No accounts to include in the report');

    const rows = allRows.filter((r) =>
      r.kind === 'income' ? body.includeIncomes !== false : body.includeExpenses !== false,
    );
    const agg = aggregateLedger(rows, includedIds, body.startDate, body.endDate);

    // description (and a customized category name) is ciphertext on a tier-1 account: print nothing.
    const tiers = await this.prisma.account.findMany({
      where: { id: { in: includedIds } },
      select: { id: true, encryptionTier: true },
    });
    const tier1 = new Set((tiers as any[]).filter((a) => (a.encryptionTier ?? 0) >= 1).map((a) => a.id as string));
    const nameById = new Map(accounts.map((a) => [a.id, a.name]));

    const locale = body.locale ?? language;
    const labels = consolidatedLabels(locale);
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
    const line = (r: LedgerRow) => ({
      date: r.date,
      type: r.kind,
      description: tier1.has(r.accountId) ? '' : r.description,
      category: r.category.name || labels.other,
      amount: r.amount,
      currency: r.currencyCode,
      account: nameById.get(r.accountId) ?? '',
      note: r.note ? labels.notes[r.note] : '',
    });

    const accountSubtotals = accounts
      .filter((a) => includedIds.includes(a.id))
      .map((a) => ({ name: a.name, ...(agg.perAccount[a.id] ?? { spent: 0, income: 0, net: 0 }) }));
    const excluded = new Set(exclude);
    const only = onlyAccountIds ? new Set(onlyAccountIds) : null;
    const excludedAccounts = accounts
      .filter((a) => a.encrypted && !excluded.has(a.id) && (only === null || only.has(a.id)))
      .map((a) => a.name);

    const { totals, fxApproximate } = agg;
    const categories = agg.expenseCategories.map((c) => ({
      name: c.name || labels.other,
      amount: c.total,
      percentage: totals.spent > 0 ? (c.total / totals.spent) * 100 : 0,
    }));
    const common = {
      accountName: labels.allAccounts,
      periodStart: body.startDate,
      periodEnd: body.endDate,
      totalIncome: totals.income,
      totalExpenses: totals.spent,
      currencyCode: base,
      categories,
      fxConverted: rows.some((r) => r.currencyCode !== base),
      fxApproximate,
      accountSubtotals,
      excludedAccounts,
    };

    let fileData: Buffer;
    let extension: string;
    if (body.format === 'csv') {
      fileData = this.csvGenerator.generate(
        sorted.map((r) => ({ ...line(r), tags: '', project: '' })),
        { accountSubtotals, totals, excludedAccounts, locale },
      );
      extension = 'csv';
    } else if (body.format === 'pdf') {
      fileData = await this.pdfGenerator.generate({
        ...common,
        locale,
        transactions: sorted.map(line),
      });
      extension = 'pdf';
    } else {
      const sheetRows = (kind: 'expense' | 'income') =>
        sorted
          .filter((r) => r.kind === kind)
          .map((r) => {
            const l = line(r);
            return {
              date: l.date,
              description: l.description,
              category: l.category,
              tags: '',
              project: '',
              amount: l.amount,
              currency: l.currency,
              notes: '',
              account: l.account,
              note: l.note,
            };
          });
      fileData = await this.excelGenerator.generate({
        ...common,
        locale,
        expenses: sheetRows('expense'),
        incomes: sheetRows('income'),
      });
      extension = 'xlsx';
    }

    const fileName = `consolidated_${body.startDate}_${body.endDate}.${extension}`;
    const report = await this.prisma.generatedReport.create({
      data: {
        accountId: null,
        accountIds: includedIds,
        userId: user.id,
        format: body.format,
        status: 'completed',
        fileName,
        fileData,
        fileSize: fileData.length,
        filters: JSON.parse(JSON.stringify(body)),
        expiresAt: new Date(Date.now() + REPORT_TTL_MS),
        completedAt: new Date(),
      },
    });

    return {
      reportId: report.id,
      status: 'completed' as const,
      downloadUrl: `/reports/${report.id}/download`,
      fileName,
      fileSize: fileData.length,
    };
  }
}
