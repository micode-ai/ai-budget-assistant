import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as Papa from 'papaparse';
import { PrismaService } from '../../database/prisma.service';
import { ImportBatchesService } from '../import-batches/import-batches.service';
import { MappingService } from './mapping/mapping.service';
import { TelegramService } from '../telegram/telegram.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { normalizeMerchantPL } from './merchants/merchants-pl';
import { decodeCsvBuffer, type EncodingHint } from './utils/encoding';
import { isPdfBuffer, extractPdfText } from './utils/pdf-text';
import { headerFingerprint } from './utils/header-fingerprint';
import { pairFxRows } from './utils/fx-pairing';
import { PARSERS, getParserById, detectParser, detectPdfParser } from './parsers/registry';
import type { BankParser } from './parsers/parser.interface';
import type {
  BankImportPreviewResponse,
  BankImportCommitResponse,
  ImportRow,
} from '@budget/shared-types';
import type { BankImportCommitBodyDto, RequestBankBodyDto } from './dto';

export interface PreviewOptions {
  bankId?: BankParser['id'];
  mappingId?: string;
  encoding?: EncodingHint;
  inlineMapping?: import('@budget/shared-types').ColumnMapping;
  delimiter?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

@Injectable()
export class ImportBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importBatches: ImportBatchesService,
    private readonly mapping: MappingService,
    private readonly telegram: TelegramService,
    private readonly anomaly: AnomalyService,
  ) {}

  /**
   * Forward a "please support my bank" request to the ops Telegram chat (the
   * app owner) — bank name, optional notes, optional sample statement file.
   * Never sent to the requesting user. Returns { ok } reflecting delivery.
   */
  async requestBank(
    user: { name: string; email: string },
    dto: RequestBankBodyDto,
    file?: Express.Multer.File,
  ): Promise<{ ok: boolean }> {
    const esc = (s: string) =>
      (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = [
      '🏦 <b>New bank import request</b>',
      '',
      `Bank: <b>${esc(dto.bankName)}</b>`,
      `From: ${esc(user.name)} (${esc(user.email)})`,
    ];
    if (dto.notes?.trim()) lines.push('', `Notes: ${esc(dto.notes.trim())}`);
    if (file) lines.push('', `Attached: ${esc(file.originalname)} (${Math.round(file.size / 1024)} KB)`);

    const sent = await this.telegram.sendMessage(lines.join('\n'));
    if (file?.buffer?.length) {
      await this.telegram.sendDocument(
        file.buffer,
        file.originalname || 'statement',
        `Sample statement for: ${esc(dto.bankName)}`,
      );
    }
    return { ok: sent };
  }

  async parsePreview(
    accountId: string,
    _userId: string,
    fileBuffer: Buffer,
    opts: PreviewOptions,
  ): Promise<BankImportPreviewResponse> {
    // PDF statements (e.g. Erste) go through a separate text-extraction path;
    // CSV header/mapping/fingerprint logic does not apply to them.
    if (isPdfBuffer(fileBuffer)) {
      return this.parsePdfPreview(accountId, fileBuffer, opts);
    }

    let text: string;
    try {
      text = decodeCsvBuffer(fileBuffer, opts.encoding ?? 'auto');
    } catch {
      throw new BadRequestException({ code: 'ENCODING_UNKNOWN' });
    }

    const headers = peekHeaders(text);
    const sampleRows = peekSampleRows(text, 3);
    const fingerprint = headerFingerprint(headers);

    let parser: BankParser | undefined;
    let columnMapping: import('@budget/shared-types').ColumnMapping | undefined;

    if (opts.mappingId) {
      const saved = await this.prisma.csvImportMapping.findFirst({
        where: { id: opts.mappingId, accountId },
      });
      if (!saved) throw new BadRequestException('Mapping not found');
      parser =
        getParserById((saved.bankId ?? 'universal') as BankParser['id']) ??
        getParserById('universal');
      columnMapping = saved.mapping as unknown as import('@budget/shared-types').ColumnMapping;
    } else if (opts.bankId) {
      parser = getParserById(opts.bankId);
      if (!parser) throw new BadRequestException('Unknown bankId');
    } else {
      const saved = await this.mapping.findByFingerprint(accountId, fingerprint);
      if (saved) {
        parser =
          getParserById((saved.bankId ?? 'universal') as BankParser['id']) ??
          getParserById('universal');
        columnMapping = saved.mapping as unknown as import('@budget/shared-types').ColumnMapping;
      } else {
        parser = detectParser(headers, sampleRows);
      }
    }

    if (opts.inlineMapping) {
      parser = getParserById('universal')!;
      columnMapping = opts.inlineMapping;
    }

    if (!parser) {
      return {
        status: 'needs_picker',
        headers,
        sampleRows,
        headerFingerprint: fingerprint,
        supportedBanks: PARSERS.map((p) => ({ id: p.id, displayName: p.displayName })),
      };
    }

    let parsed: ReturnType<BankParser['parse']>;
    try {
      parsed = parser.parse(text, {
        columnMapping,
        delimiter: opts.delimiter,
        amountFormat: opts.amountFormat,
        dateFormat: opts.dateFormat,
      });
    } catch (e: any) {
      throw new BadRequestException({ code: 'PARSE_FAILED', message: e.message });
    }

    const parseErrors = countParseFailures(text, parsed.rows.length);
    return this.buildPreviewResponse(accountId, parser, parsed.rows, parseErrors, fingerprint);
  }

  /** PDF statement path: extract text, pick a PDF parser, then shared dedup. */
  private async parsePdfPreview(
    accountId: string,
    fileBuffer: Buffer,
    opts: PreviewOptions,
  ): Promise<BankImportPreviewResponse> {
    let text: string;
    try {
      text = await extractPdfText(fileBuffer);
    } catch (e: any) {
      throw new BadRequestException({ code: 'PARSE_FAILED', message: e.message });
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let parser: BankParser | undefined;
    if (opts.bankId) {
      parser = getParserById(opts.bankId);
      if (!parser) throw new BadRequestException('Unknown bankId');
      if ((parser.format ?? 'csv') !== 'pdf') {
        throw new BadRequestException({ code: 'PARSE_FAILED', message: 'Selected bank does not accept PDF' });
      }
    } else {
      parser = detectPdfParser(lines);
    }

    if (!parser) {
      return {
        status: 'needs_picker',
        headers: lines.slice(0, 20),
        sampleRows: [],
        supportedBanks: PARSERS.filter((p) => (p.format ?? 'csv') === 'pdf').map((p) => ({
          id: p.id,
          displayName: p.displayName,
        })),
      };
    }

    let parsed: ReturnType<BankParser['parse']>;
    try {
      parsed = parser.parse(text);
    } catch (e: any) {
      throw new BadRequestException({ code: 'PARSE_FAILED', message: e.message });
    }

    return this.buildPreviewResponse(accountId, parser, parsed.rows, 0);
  }

  /** Stamp externalRefs, pair FX rows, flag already-imported, shape response. */
  private async buildPreviewResponse(
    accountId: string,
    parser: BankParser,
    parsedRows: ReturnType<BankParser['parse']>['rows'],
    parseErrors: number,
    fingerprint?: string,
  ): Promise<BankImportPreviewResponse> {
    const withRefs: ImportRow[] = parsedRows.map((r) => ({
      ...r,
      merchant: normalizeMerchantPL(r.merchant),
      externalRef: buildExternalRef(parser.id, r),
      alreadyImported: false,
    }));

    const paired = pairFxRows(withRefs, parser.id);

    const refs = paired.map((r) => r.externalRef);
    const [exExp, exInc, exFx] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
    ]);

    const seen = new Set([
      ...exExp.map((e) => e.externalRef!),
      ...exInc.map((e) => e.externalRef!),
      ...exFx.map((e) => e.externalRef!),
    ]);
    for (const r of paired) {
      if (seen.has(r.externalRef)) r.alreadyImported = true;
    }

    // Content-based dedup: flag rows that match an EXISTING transaction
    // (manual or any source) by date + signed amount + currency, so the same
    // operation isn't duplicated even when it has no externalRef. Greedy 1-to-1
    // so N existing rows only absorb N import rows; extras stay importable.
    await this.flagContentDuplicates(accountId, paired);

    return {
      status: 'parsed',
      detectedBankId: parser.id,
      totalRows: paired.length,
      importable: paired.filter((r) => !r.alreadyImported).length,
      skipped: paired.filter((r) => r.alreadyImported).length,
      parseErrors,
      rows: paired,
      headerFingerprint: fingerprint,
    };
  }

  /**
   * Mark import rows that already exist in the account as `alreadyImported`,
   * matching on (date, signed-amount-in-cents, currency) against existing
   * Expense/Income regardless of source. Uses a multiset so the match is
   * one-to-one: if the file has two identical rows but only one already
   * exists, only one is flagged and the other remains importable. FX rows are
   * excluded (they dedup by externalRef only).
   */
  private async flagContentDuplicates(accountId: string, rows: ImportRow[]): Promise<void> {
    const candidates = rows.filter((r) => r.kind !== 'fx');
    if (candidates.length === 0) return;

    const isoDates = [...new Set(candidates.map((r) => r.date))].filter(Boolean).sort();
    if (isoDates.length === 0) return;

    const dateFilter = { in: isoDates.map((d) => new Date(d)) };
    const [exps, incs] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, date: dateFilter },
        select: { date: true, amount: true, currencyCode: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, date: dateFilter },
        select: { date: true, amount: true, currencyCode: true },
      }),
    ]);

    const keyOf = (isoDate: string, signedCents: number, currency: string) =>
      `${isoDate}|${signedCents}|${currency}`;
    const toIso = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const cents = (amount: number, sign: number) => Math.round(sign * Number(amount) * 100);

    // Multiset of existing transactions available to absorb a duplicate.
    const counts = new Map<string, number>();
    const bump = (k: string, by: number) => counts.set(k, (counts.get(k) ?? 0) + by);
    for (const e of exps) bump(keyOf(toIso(e.date), cents(e.amount as unknown as number, -1), e.currencyCode), 1);
    for (const i of incs) bump(keyOf(toIso(i.date), cents(i.amount as unknown as number, 1), i.currencyCode), 1);

    const rowKey = (r: ImportRow) =>
      keyOf(r.date, cents(r.amount, r.kind === 'expense' ? -1 : 1), r.currencyCode);

    // Rows already flagged via externalRef correspond to an existing row, so
    // consume their slot first to avoid double-counting against content dups.
    for (const r of candidates) {
      if (!r.alreadyImported) continue;
      const k = rowKey(r);
      if ((counts.get(k) ?? 0) > 0) bump(k, -1);
    }

    // Greedily flag remaining rows that still have an existing match available.
    for (const r of candidates) {
      if (r.alreadyImported) continue;
      const k = rowKey(r);
      if ((counts.get(k) ?? 0) > 0) {
        r.alreadyImported = true;
        bump(k, -1);
      }
    }
  }

  async commit(
    accountId: string,
    userId: string,
    dto: BankImportCommitBodyDto,
  ): Promise<BankImportCommitResponse> {
    const toImport = dto.rows.filter((r) => !r.alreadyImported);
    let createdExpenses = 0;
    let createdIncomes = 0;
    let createdExchanges = 0;
    let skippedDuplicates = 0;
    let batchId!: string;
    const createdExpenseIds: string[] = [];

    const categoryCache = new Map<string, string | null>();
    const source = `bank:${dto.bankId ?? 'universal'}`;

    await this.prisma.$transaction(async (tx) => {
      batchId = await this.importBatches.createBatch(tx as any, { accountId, userId, source });

      for (const row of toImport) {
        try {
          if (row.kind === 'expense') {
            const categoryId = await this.resolveCategoryId(
              tx as any,
              accountId,
              row.suggestedCategoryName,
              categoryCache,
            );
            const created = await (tx as any).expense.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                amount: row.amount,
                currencyCode: row.currencyCode,
                description: row.description,
                merchant: normalizeMerchantPL(row.merchant) ?? null,
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
            const categoryId = await this.resolveCategoryId(
              tx as any,
              accountId,
              row.suggestedCategoryName,
              categoryCache,
            );
            await (tx as any).income.create({
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
            await (tx as any).currencyExchange.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                fromCurrency: row.fxFromCurrency!,
                toCurrency: row.fxToCurrency!,
                fromAmount: row.fxFromAmount!,
                toAmount: row.fxToAmount!,
                exchangeRate: row.fxRate ?? 0,
                date: new Date(row.date),
                externalRef: row.externalRef,
                importBatchId: batchId,
              },
            });
            createdExchanges++;
          }
        } catch (err: any) {
          if (err?.code === 'P2002') {
            skippedDuplicates++;
            continue;
          }
          throw err;
        }
      }

      await this.importBatches.finalizeBatch(tx as any, batchId, createdExpenses + createdIncomes + createdExchanges);
    });

    // Fire-and-forget anomaly detection on the committed expenses.
    this.anomaly.checkExpenseBatch(accountId, userId, createdExpenseIds).catch(() => {});

    let savedMappingId: string | undefined;
    if (dto.saveMapping && dto.mapping && dto.headerFingerprint) {
      const saved = await this.mapping.create(accountId, {
        name: dto.saveMapping.name,
        headerFingerprint: dto.headerFingerprint,
        bankId: dto.bankId,
        mapping: dto.mapping,
        delimiter: dto.delimiter,
        encoding: dto.encoding,
        amountFormat: dto.amountFormat,
        dateFormat: dto.dateFormat,
      });
      savedMappingId = saved.id;
    }

    return {
      createdExpenses,
      createdIncomes,
      createdExchanges,
      skippedDuplicates,
      parseErrors: 0,
      savedMappingId,
      batchId,
    };
  }

  private async resolveCategoryId(
    tx: any,
    accountId: string,
    suggestedName: string | undefined,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    if (!suggestedName) return null;
    if (cache.has(suggestedName)) return cache.get(suggestedName)!;
    const cat = await tx.category.findFirst({
      where: { accountId, name: suggestedName },
      select: { id: true },
    });
    const id = cat?.id ?? null;
    cache.set(suggestedName, id);
    return id;
  }
}

function peekHeaders(text: string): string[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter: ';',
    preview: 1,
  });
  const first = result.data[0];
  return first ? first.map((h) => String(h).trim()) : [];
}

function peekSampleRows(text: string, count: number): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter: ';',
    preview: count + 1,
  });
  return result.data.slice(1).map((r) => r.map(String));
}

function buildExternalRef(
  bankId: string,
  row: { kind: string; date: string; amount: number; description: string },
): string {
  const cents = Math.round((row.kind === 'expense' ? -1 : 1) * row.amount * 100);
  const normalized = (row.description || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  const stripped = normalized.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hash = createHash('sha256').update(stripped).digest('hex').slice(0, 8);
  return `bank:${bankId}:${row.date}:${cents}:${hash}`;
}

function countParseFailures(text: string, importedCount: number): number {
  const totalRows = text.split('\n').filter((l) => l.trim().length > 0).length - 1;
  return Math.max(0, totalRows - importedCount);
}
