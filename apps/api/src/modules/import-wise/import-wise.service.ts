import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as Papa from 'papaparse';
import { PrismaService } from '../../database/prisma.service';
import { ImportBatchesService } from '../import-batches/import-batches.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { WiseImportCommitDto } from './dto';
import type { WiseImportPreviewResponse, WiseImportRow, WiseImportCommitResponse } from '@budget/shared-types';

export const MERCHANT_CATEGORY_HINTS: Record<string, string> = {
  UBER: 'Transport',
  BOLT: 'Transport',
  LYFT: 'Transport',
  WIZZAIR: 'Travel',
  RYANAIR: 'Travel',
  AIRBNB: 'Travel',
  'BOOKING.COM': 'Travel',
  LIDL: 'Groceries',
  ALDI: 'Groceries',
  AMAZON: 'Shopping',
  NETFLIX: 'Subscriptions',
  SPOTIFY: 'Subscriptions',
  STARBUCKS: 'Cafe & Restaurants',
  MCDONALD: 'Cafe & Restaurants',
};

interface WiseRawRow {
  'TransferWise ID': string;
  Date: string;
  Amount: string;
  Currency: string;
  Description: string;
  'Payment Reference': string;
  'Exchange From': string;
  'Exchange To': string;
  'Exchange Rate': string;
  'Exchange From Amount': string;
  'Exchange To Amount': string;
  'Payer Name': string;
  'Payee Name': string;
  Merchant: string;
  'Total fees': string;
  Note: string;
}


// UTF-8 BOM that Wise prepends to CSV exports
const BOM_PATTERN = new RegExp('^\uFEFF');

function parseIsoDate(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const dateOnly = trimmed.split(/[\sT]/)[0];

  let m = dateOnly.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  m = dateOnly.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

function suggestCategory(merchant: string | undefined): string | undefined {
  if (!merchant) return undefined;
  const upper = merchant.toUpperCase();
  for (const key of Object.keys(MERCHANT_CATEGORY_HINTS)) {
    if (upper.includes(key)) return MERCHANT_CATEGORY_HINTS[key];
  }
  return undefined;
}

@Injectable()
export class ImportWiseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importBatches: ImportBatchesService,
    private readonly anomaly: AnomalyService,
    private readonly merchantRules: MerchantRulesService,
  ) {}

  async parsePreview(
    accountId: string,
    _userId: string,
    fileBuffer: Buffer,
  ): Promise<WiseImportPreviewResponse> {
    const text = fileBuffer.toString('utf8').replace(BOM_PATTERN, '');

    const result = Papa.parse<WiseRawRow>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      throw new BadRequestException('Failed to parse Wise CSV: ' + result.errors[0].message);
    }

    const rawRows = result.data;

    if (rawRows.length > 0 && !('TransferWise ID' in rawRows[0])) {
      throw new BadRequestException(
        'Unsupported CSV format: expected Wise statement columns (TransferWise ID, Date, Amount, ...)',
      );
    }

    const fxCandidates = rawRows.filter(
      (r) => r['Exchange From'] && r['Exchange To'] && r['Exchange From'] !== r['Exchange To'],
    );

    const pairedIds = new Set<string>();
    const fxRows: WiseImportRow[] = [];
    let idx = 0;

    for (let i = 0; i < fxCandidates.length; i++) {
      const rowA = fxCandidates[i];
      if (pairedIds.has(rowA['TransferWise ID'])) continue;

      const amtA = parseFloat(rowA.Amount);
      const ref = rowA['Payment Reference'];
      const date = rowA.Date;

      for (let j = i + 1; j < fxCandidates.length; j++) {
        const rowB = fxCandidates[j];
        if (pairedIds.has(rowB['TransferWise ID'])) continue;

        const amtB = parseFloat(rowB.Amount);

        if (
          rowB['Payment Reference'] === ref &&
          rowB.Date === date &&
          Math.sign(amtA) !== Math.sign(amtB)
        ) {
          const outRow = amtA < 0 ? rowA : rowB;
          const inRow = amtA < 0 ? rowB : rowA;
          const fxFromAmount = Math.abs(parseFloat(outRow.Amount));
          const fxToAmount = Math.abs(parseFloat(inRow.Amount));
          const fxRate = parseFloat(outRow['Exchange Rate']) || (fxToAmount / fxFromAmount);

          fxRows.push({
            idx: idx++,
            kind: 'fx',
            date: parseIsoDate(outRow.Date),
            amount: fxFromAmount,
            currencyCode: outRow.Currency,
            description: outRow.Description || outRow['Payment Reference'] || 'Currency exchange',
            externalRef: `wise:${outRow['TransferWise ID']}+${inRow['TransferWise ID']}`,
            alreadyImported: false,
            fxFromCurrency: outRow['Exchange From'],
            fxFromAmount,
            fxToCurrency: inRow['Exchange From'],
            fxToAmount,
            fxRate,
          });

          pairedIds.add(rowA['TransferWise ID']);
          pairedIds.add(rowB['TransferWise ID']);
          break;
        }
      }
    }

    const regularRows: WiseImportRow[] = rawRows
      .filter((r) => !pairedIds.has(r['TransferWise ID']))
      .map((r) => {
        const raw = parseFloat(r.Amount);
        const fees = Math.abs(parseFloat(r['Total fees'] || '0') || 0);
        const amount = Math.abs(raw) + fees;
        const kind = raw < 0 ? 'expense' : 'income';
        const merchant = r.Merchant || undefined;
        const description = r.Description || merchant || r['Payment Reference'] || '';

        return {
          idx: idx++,
          kind,
          date: parseIsoDate(r.Date),
          amount,
          currencyCode: r.Currency,
          description,
          merchant,
          externalRef: `wise:${r['TransferWise ID']}`,
          suggestedCategoryName: suggestCategory(merchant),
          alreadyImported: false,
        } as WiseImportRow;
      });

    const allRows = [...fxRows, ...regularRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const allRefs = allRows.map((r) => r.externalRef);

    const [existingExpenses, existingIncomes, existingExchanges] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, externalRef: { in: allRefs } },
        select: { externalRef: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, externalRef: { in: allRefs } },
        select: { externalRef: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId, externalRef: { in: allRefs } },
        select: { externalRef: true },
      }),
    ]);

    const seenRefs = new Set<string>([
      ...existingExpenses.map((e) => e.externalRef!),
      ...existingIncomes.map((e) => e.externalRef!),
      ...existingExchanges.map((e) => e.externalRef!),
    ]);

    for (const row of allRows) {
      if (seenRefs.has(row.externalRef)) {
        row.alreadyImported = true;
      }
    }

    const skipped = allRows.filter((r) => r.alreadyImported).length;
    const importable = allRows.length - skipped;

    return {
      totalRows: allRows.length,
      importable,
      skipped,
      rows: allRows,
    };
  }

  async commit(
    accountId: string,
    userId: string,
    dto: WiseImportCommitDto,
  ): Promise<WiseImportCommitResponse> {
    const rowsToImport = dto.rows.filter((r) => !r.alreadyImported);

    let createdExpenses = 0;
    let createdIncomes = 0;
    let createdExchanges = 0;
    let batchId!: string;
    const createdExpenseIds: string[] = [];

    const categoryCache = new Map<string, string | null>();
    const merchantRulesMap = await this.merchantRules.getRulesMap(accountId);

    await this.prisma.$transaction(async (tx) => {
      batchId = await this.importBatches.createBatch(tx, { accountId, userId, source: 'wise' });

      for (const row of rowsToImport) {
        try {
          if (row.kind === 'expense') {
            // Apply user's learned rule first (higher priority than static hints)
            const normalizedMerchant = row.merchant?.trim().toLowerCase();
            const userRuleCategoryId = normalizedMerchant ? merchantRulesMap.get(normalizedMerchant) ?? null : null;

            let categoryId: string | null = userRuleCategoryId;
            if (!categoryId && row.suggestedCategoryName) {
              if (categoryCache.has(row.suggestedCategoryName)) {
                categoryId = categoryCache.get(row.suggestedCategoryName)!;
              } else {
                const cat = await tx.category.findFirst({
                  where: { accountId, name: row.suggestedCategoryName },
                  select: { id: true },
                });
                categoryId = cat?.id ?? null;
                categoryCache.set(row.suggestedCategoryName, categoryId);
              }
            }

            const created = await tx.expense.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                amount: row.amount,
                currencyCode: row.currencyCode,
                description: row.description,
                merchant: row.merchant ?? null,
                date: new Date(row.date),
                source: 'import',
                externalRef: row.externalRef,
                importBatchId: batchId,
                ...(categoryId ? { categoryId } : {}),
              },
              select: { id: true },
            });
            createdExpenseIds.push(created.id);
            createdExpenses++;
          } else if (row.kind === 'income') {
            let categoryId: string | null = null;
            if (row.suggestedCategoryName) {
              if (categoryCache.has(row.suggestedCategoryName)) {
                categoryId = categoryCache.get(row.suggestedCategoryName)!;
              } else {
                const cat = await tx.category.findFirst({
                  where: { accountId, name: row.suggestedCategoryName },
                  select: { id: true },
                });
                categoryId = cat?.id ?? null;
                categoryCache.set(row.suggestedCategoryName, categoryId);
              }
            }

            await tx.income.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                amount: row.amount,
                currencyCode: row.currencyCode,
                description: row.description,
                date: new Date(row.date),
                externalRef: row.externalRef,
                importBatchId: batchId,
                ...(categoryId ? { categoryId } : {}),
              },
            });
            createdIncomes++;
          } else if (row.kind === 'fx') {
            await tx.currencyExchange.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                fromCurrency: row.fxFromCurrency!,
                toCurrency: row.fxToCurrency!,
                fromAmount: row.fxFromAmount!,
                toAmount: row.fxToAmount!,
                exchangeRate: row.fxRate!,
                date: new Date(row.date),
                externalRef: row.externalRef,
                importBatchId: batchId,
              },
            });
            createdExchanges++;
          }
        } catch (err: any) {
          if (err?.code === 'P2002') {
            continue;
          }
          throw err;
        }
      }

      await this.importBatches.finalizeBatch(tx, batchId, createdExpenses + createdIncomes + createdExchanges);
    });

    // Fire-and-forget anomaly detection on the committed expenses.
    this.anomaly.checkExpenseBatch(accountId, userId, createdExpenseIds).catch(() => {});

    return { createdExpenses, createdIncomes, createdExchanges, batchId };
  }
}
