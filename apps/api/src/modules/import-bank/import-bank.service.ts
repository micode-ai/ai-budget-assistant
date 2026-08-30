import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ImportBatchesService } from '../import-batches/import-batches.service';
import { MappingService } from './mapping/mapping.service';
import { TelegramService } from '../telegram/telegram.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { normalizeMerchantPL } from './merchants/merchants-pl';
import { decodeCsvBuffer, type EncodingHint } from './utils/encoding';
import { isPdfBuffer, extractPdfText } from './utils/pdf-text';
import { isXlsxBuffer, xlsxToCsv } from './utils/xlsx-to-csv';
import { headerFingerprint } from './utils/header-fingerprint';
import { sniffDelimiter } from './utils/delimiter';
import { peekHeaders, peekSampleRows, countParseFailures } from './utils/csv-preview';
import { SignatureService } from './ai/signature.service';
import { ImportBankAiPreviewService } from './ai-preview.service';
import { ImportBankAiPdfService } from './ai-pdf.service';
import { ImportBankDedupService } from './import-bank-dedup.service';
import { resolveCategoryId, preloadCategories } from './import-bank-category.util';
import { PARSERS, getParserById, detectParser, detectPdfParser } from './parsers/registry';
import type { BankParser } from './parsers/parser.interface';
import type {
  BankImportPreviewResponse,
  BankImportCommitResponse,
} from '@budget/shared-types';
import type { BankImportCommitBodyDto, RequestBankBodyDto } from './dto';
import { logFireAndForget } from '../../common/utils/fire-and-forget';

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
  private readonly logger = new Logger(ImportBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importBatches: ImportBatchesService,
    private readonly mapping: MappingService,
    private readonly telegram: TelegramService,
    private readonly anomaly: AnomalyService,
    private readonly merchantRules: MerchantRulesService,
    private readonly signatures: SignatureService,
    private readonly aiPreview: ImportBankAiPreviewService,
    private readonly aiPdf: ImportBankAiPdfService,
    private readonly dedup: ImportBankDedupService,
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
    userId: string,
    fileBuffer: Buffer,
    opts: PreviewOptions,
  ): Promise<BankImportPreviewResponse> {
    // PDF statements (e.g. Erste) go through a separate text-extraction path;
    // CSV header/mapping/fingerprint logic does not apply to them.
    if (isPdfBuffer(fileBuffer)) {
      return this.parsePdfPreview(accountId, userId, fileBuffer, opts);
    }

    let text: string;
    if (isXlsxBuffer(fileBuffer)) {
      try {
        text = await xlsxToCsv(fileBuffer);
      } catch {
        throw new BadRequestException({ code: 'PARSE_FAILED', message: 'Unreadable spreadsheet' });
      }
    } else {
      try {
        text = decodeCsvBuffer(fileBuffer, opts.encoding ?? 'auto');
      } catch {
        throw new BadRequestException({ code: 'ENCODING_UNKNOWN' });
      }
    }

    const delimiter = sniffDelimiter(text);
    const headers = peekHeaders(text, delimiter);
    const sampleRows = peekSampleRows(text, 3, delimiter);
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
      let saved = await this.mapping.findByFingerprint(accountId, fingerprint);
      if (!saved && delimiter !== ';') {
        // Before delimiter sniffing, peekHeaders hardcoded ';', so a comma-
        // or tab-delimited export produced a single merged header cell and
        // was fingerprinted on THAT string. Retry once against the legacy
        // fingerprint so an account's mapping saved under it isn't silently
        // orphaned, then re-key the row so this fallback is needed only once.
        const legacyFingerprint = headerFingerprint(peekHeaders(text, ';'));
        saved = await this.mapping.findByFingerprint(accountId, legacyFingerprint);
        if (saved) {
          void this.mapping
            .rekey(saved.id, fingerprint)
            .catch(logFireAndForget(this.logger, 'ImportBankService.rekeyMapping'));
        }
      }
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
      return this.aiPreview.tryAiMapping(accountId, userId, text, headers, fingerprint, delimiter);
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
    return this.dedup.buildPreviewResponse(accountId, parser, parsed.rows, parseErrors, fingerprint);
  }

  /** PDF statement path: extract text, pick a PDF parser, then shared dedup. */
  private async parsePdfPreview(
    accountId: string,
    userId: string,
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
      return this.aiPdf.tryAiExtraction(accountId, userId, text, lines, fileBuffer);
    }

    let parsed: ReturnType<BankParser['parse']>;
    try {
      parsed = parser.parse(text);
    } catch (e: any) {
      throw new BadRequestException({ code: 'PARSE_FAILED', message: e.message });
    }

    return this.dedup.buildPreviewResponse(accountId, parser, parsed.rows, 0);
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
    const merchantRulesMap = await this.merchantRules.getRulesMap(accountId);

    // Pre-filter duplicate externalRefs BEFORE opening the transaction (ABA-313).
    // Postgres aborts the ENTIRE transaction on the first unique-constraint
    // violation (`account_id, external_ref`); every subsequent statement then
    // fails with 25P02 ("current transaction is aborted"). So catching P2002 and
    // continuing inside the tx crashes the whole import. Removing duplicates up
    // front — both already-in-DB and repeats within this batch — means the
    // constraint never fires. (Covers the gaps the preview's alreadyImported flag
    // misses: intra-file repeats, and rows imported between preview and commit.)
    const rowsToInsert = await this.dedup.dropDuplicateRows(accountId, toImport);
    skippedDuplicates += toImport.length - rowsToInsert.length;

    // Resolve — and where needed create — every category the rows reference,
    // BEFORE the transaction opens, for the same reason duplicates are dropped
    // above: a P2002 inside a Postgres transaction poisons it, and creating a
    // category the account already has under a different case would fire the
    // `(account_id, name, type)` constraint mid-import.
    await preloadCategories(this.prisma, accountId, rowsToInsert, categoryCache);

    await this.prisma.$transaction(async (tx) => {
      batchId = await this.importBatches.createBatch(tx as any, { accountId, userId, source });

      for (const row of rowsToInsert) {
        try {
          if (row.kind === 'expense') {
            // Apply user's learned merchant rule (higher priority than parser-suggested category)
            const normalizedMerchant = row.merchant?.trim().toLowerCase();
            const userRuleCategoryId = normalizedMerchant ? merchantRulesMap.get(normalizedMerchant) ?? null : null;

            const categoryId = userRuleCategoryId ?? await resolveCategoryId(
              tx as any,
              accountId,
              row.suggestedCategoryName,
              categoryCache,
              'expense',
            );
            const created = await (tx as any).expense.create({
              data: {
                accountId,
                userId,
                clientId: randomUUID(),
                amount: row.amount,
                currencyCode: row.currencyCode,
                description: row.description,
                // Re-normalize defensively (idempotent) in case an old client sent a raw merchant.
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
            const categoryId = await resolveCategoryId(
              tx as any,
              accountId,
              row.suggestedCategoryName,
              categoryCache,
              'income',
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
          // A per-row failure poisons the whole Postgres transaction (25P02), so
          // we cannot skip-and-continue — abort and roll back the import (no
          // partial commit). Duplicates were already removed above, so a P2002
          // here is only a rare concurrent double-commit race; the client can
          // safely retry (the pre-filter will then skip the now-existing row).
          throw err;
        }
      }

      await this.importBatches.finalizeBatch(tx as any, batchId, createdExpenses + createdIncomes + createdExchanges);
    });

    // Fire-and-forget anomaly detection on the committed expenses.
    this.anomaly
      .checkExpenseBatch(accountId, userId, createdExpenseIds)
      .catch(logFireAndForget(this.logger, 'ImportBankService.checkExpenseBatch'));

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

    // Signature-dictionary bookkeeping — deliberately independent of
    // `saveMapping` above. "Save my own mapping for next time" and "tell the
    // global dictionary its guess was wrong" are two different client
    // decisions: a user can re-open the "Wrong? Tap to fix" mapper, change
    // one column, and commit WITHOUT ticking "save this mapping" — that is
    // still a correction. Conversely a plain AI-accepted import, or a trip
    // through the mapper where nothing was actually changed, must confirm,
    // not correct, even though it never went near `saveMapping` either.
    //
    // The signal is structural: does `dto.mapping` (what actually parsed
    // this file) differ from the mapping the dictionary currently serves for
    // this fingerprint? No stored signature (never inferred, or already
    // quarantined) or an unchanged mapping both confirm, matching the prior
    // behavior for those cases. This MUST stay mutually exclusive with
    // confirming, or correctedCount could never outnumber confirmedCount and
    // self-quarantine (signature.service.ts's isQuarantined) could never
    // fire, no matter how many users corrected the same bad mapping.
    if (dto.headerFingerprint) {
      const isCorrection = await this.aiPreview.isMappingCorrection(dto.headerFingerprint, dto.mapping);
      if (isCorrection) {
        void this.signatures
          .markCorrected(dto.headerFingerprint)
          .catch(logFireAndForget(this.logger, 'ImportBankService.markCorrected'));
      } else {
        // Fire-and-forget: never allowed to fail an import that already succeeded.
        void this.signatures
          .confirm(dto.headerFingerprint)
          .catch(logFireAndForget(this.logger, 'ImportBankService.confirmSignature'));
      }
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
}
