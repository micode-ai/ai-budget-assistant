import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as Papa from 'papaparse';
import { PrismaService } from '../../database/prisma.service';
import { ImportBatchesService } from '../import-batches/import-batches.service';
import { MappingService } from './mapping/mapping.service';
import { TelegramService } from '../telegram/telegram.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { expensePayee, DUP_DAY_MS } from '../anomaly/anomaly.service';
import { MerchantRulesService } from '../merchant-rules/merchant-rules.service';
import { normalizeMerchantPL } from './merchants/merchants-pl';
import { decodeCsvBuffer, type EncodingHint } from './utils/encoding';
import { isPdfBuffer, extractPdfText } from './utils/pdf-text';
import { isXlsxBuffer, xlsxToCsv } from './utils/xlsx-to-csv';
import { headerFingerprint } from './utils/header-fingerprint';
import { sniffDelimiter } from './utils/delimiter';
import { columnMappingsEqual } from './utils/column-mapping';
import { pairFxRows } from './utils/fx-pairing';
import { SignatureService } from './ai/signature.service';
import { StatementAiService } from './ai/statement-ai.service';
import { MAX_SAMPLE_ROWS } from './ai/statement-ai.prompt';
import { toParserResult } from './parsers/ai-statement.parser';
import { findStatementBalances, reconcile } from './ai/balance-check';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CacheService } from '../../common/cache/cache.service';
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
  private readonly logger = new Logger(ImportBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importBatches: ImportBatchesService,
    private readonly mapping: MappingService,
    private readonly telegram: TelegramService,
    private readonly anomaly: AnomalyService,
    private readonly merchantRules: MerchantRulesService,
    private readonly signatures: SignatureService,
    private readonly statementAi: StatementAiService,
    private readonly subscriptions: SubscriptionsService,
    private readonly cache: CacheService,
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
          void this.mapping.rekey(saved.id, fingerprint).catch(() => {});
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
      return this.tryAiMapping(accountId, userId, text, headers, fingerprint, delimiter);
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

  private static readonly MAX_INFERENCES_PER_DAY = parseInferenceQuotaEnv(
    process.env.AI_IMPORT_MAX_INFERENCES_PER_DAY,
  );

  /**
   * Shared account lookup for both consent call sites below: a tier-2 (fully
   * encrypted) account can never use AI import — the server cannot read its
   * data at all — and both the read-only resolver and the explicit grant
   * endpoint need that plus whether consent is already on file.
   */
  private async getConsentAccount(
    accountId: string,
  ): Promise<{ aiImportConsentAt: Date | null; encryptionTier: number } | null> {
    return this.prisma.account.findUnique({
      where: { id: accountId },
      select: { aiImportConsentAt: true, encryptionTier: true },
    });
  }

  /**
   * Read-only: reports the account's AI-import consent state and NEVER
   * writes it. Recording consent is the exclusive job of `grantAiConsent`
   * (the `ViewerBlockGuard`-protected `POST /import/bank/ai-consent`), never
   * of `preview` — `preview` carries no such guard, so if this resolver could
   * also grant consent implicitly, any viewer previewing a file could record
   * account-wide consent on every other member's behalf.
   *
   * Returns three outcomes rather than a boolean so the caller can tell
   * "ask the user" from "this account can never use AI import" with a single
   * query — an E2EE account must see the bank picker, not a consent screen it
   * cannot act on.
   */
  private async resolveAiConsent(
    accountId: string,
  ): Promise<'ok' | 'needs_consent' | 'unsupported'> {
    const account = await this.getConsentAccount(accountId);
    if (!account) return 'unsupported';
    // The server cannot read a fully-encrypted account's data at all.
    if (account.encryptionTier === 2) return 'unsupported';
    return account.aiImportConsentAt ? 'ok' : 'needs_consent';
  }

  /**
   * The single writer of AI-import consent. Called from the client's
   * dedicated consent screen; `preview` never grants consent itself (see
   * `resolveAiConsent` above) — this is where account-wide state changes,
   * which is why the route is `ViewerBlockGuard`-protected.
   */
  async grantAiConsent(accountId: string): Promise<{ ok: boolean }> {
    const account = await this.getConsentAccount(accountId);
    if (!account || account.encryptionTier === 2) {
      throw new BadRequestException({
        code: 'E2EE_UNSUPPORTED',
        message: 'AI import is unavailable for fully encrypted accounts',
      });
    }
    await this.prisma.account.update({
      where: { id: accountId },
      data: { aiImportConsentAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Mapping inference is free and outside the monthly AI limit, so it needs
   * its own ceiling.
   *
   * The counter lives in Redis, NOT in `usage_logs`: the only writer of that
   * table is SubscriptionsService.trackAiUsage, which is exactly the monthly
   * billing counter this path is specified to stay out of. CacheService is
   * @Global(), so no module import is needed.
   *
   * get-then-set is not atomic, so two simultaneous uploads can both see the
   * same count. That is the same benign read-then-act race the anomaly push
   * cap already accepts — this is an abuse ceiling, not an accounting record.
   */
  private async consumeInferenceQuota(accountId: string): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `aiimp:${accountId}:${day}`;
    const used = (await this.cache.get<number>(key)) ?? 0;
    if (used >= ImportBankService.MAX_INFERENCES_PER_DAY) return false;
    await this.cache.set(key, used + 1, 24 * 60 * 60);
    return true;
  }

  /**
   * The currency to stamp on a row whose mapping has no `currency` column —
   * the user's own display currency, not a hardcoded default, so a EUR/GBP
   * statement that only prints its currency in the header (not per row)
   * doesn't get silently relabelled PLN. Fail-silent by design: a lookup
   * failure must degrade to a default, never abort the import.
   */
  private async resolveDefaultCurrency(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { currencyCode: true },
      });
      return user?.currencyCode ?? 'PLN';
    } catch {
      return 'PLN';
    }
  }

  /**
   * Last two links in the parser-resolution chain: the global signature
   * dictionary, then LLM inference. Returns a fully-built preview on success
   * and degrades to needs_ai_consent / needs_mapping / needs_picker otherwise.
   */
  private async tryAiMapping(
    accountId: string,
    userId: string,
    text: string,
    headers: string[],
    fingerprint: string,
    delimiter: string,
  ): Promise<BankImportPreviewResponse> {
    const universal = getParserById('universal')!;
    // Resolved once and reused by both the signature-dictionary branch and the
    // inference branch below, so a EUR/GBP statement with no per-row currency
    // column is never silently relabelled PLN on either path.
    const defaultCurrency = await this.resolveDefaultCurrency(userId);

    // The model gets more rows than parser-detection heuristics do: sample
    // rows are the main lever on inference accuracy, and 3 rows (what
    // detectParser used upstream, in parsePreview, and still does — that
    // path's own sample-row count is untouched here) often cannot
    // distinguish a booking date from a value date, or an amount column
    // from a running balance.
    const aiSampleRows = peekSampleRows(text, MAX_SAMPLE_ROWS, delimiter);

    const picker = (): BankImportPreviewResponse => ({
      status: 'needs_picker',
      headers,
      sampleRows: aiSampleRows,
      headerFingerprint: fingerprint,
      supportedBanks: PARSERS.filter((p) => p.id !== 'ai').map((p) => ({
        id: p.id,
        displayName: p.displayName,
      })),
    });

    const runUniversal = (
      mapping: import('@budget/shared-types').ColumnMapping,
      amountFormat: 'polish' | 'standard' | undefined,
      dateFormat: PreviewOptions['dateFormat'],
      usedDelimiter: string,
      currency: string,
    ) => {
      try {
        return universal.parse(text, {
          columnMapping: mapping,
          delimiter: usedDelimiter,
          amountFormat,
          dateFormat,
          defaultCurrency: currency,
        });
      } catch {
        return null;
      }
    };

    // 1. Global signature dictionary — free, no LLM call.
    const stored = await this.signatures.find(fingerprint);
    if (stored) {
      const parsed = runUniversal(
        stored.mapping,
        stored.amountFormat,
        stored.dateFormat,
        stored.delimiter ?? delimiter,
        defaultCurrency,
      );
      if (parsed && parsed.rows.length > 0) {
        const response = await this.buildPreviewResponse(
          accountId, universal, parsed.rows, countParseFailures(text, parsed.rows.length), fingerprint,
        );
        return {
          ...response,
          aiInferred: true,
          aiMapping: stored.mapping,
          aiBankLabel: stored.bankLabel,
          // Echoed so a client can re-open the manual mapper (the "Wrong? Tap
          // to fix" chips) on the SAME parse context that produced this
          // preview, instead of the mapper's own hardcoded defaults — which
          // would silently discard a comma/tab-delimited file's real
          // delimiter and re-parse to zero rows.
          headers,
          sampleRows: aiSampleRows,
          delimiter: stored.delimiter ?? delimiter,
          amountFormat: stored.amountFormat,
          dateFormat: stored.dateFormat,
          ...(stored.mapping.currency ? {} : { currencyAssumed: defaultCurrency }),
        };
      }
      // A stored signature that no longer parses is stale for this file; fall
      // through and let the model try again.
    }

    // 2. LLM inference, behind consent, E2EE and quota gates.
    if (!this.statementAi.isEnabled()) return picker();
    const consent = await this.resolveAiConsent(accountId);
    if (consent === 'unsupported') return picker();
    if (consent === 'needs_consent') {
      return {
        status: 'needs_ai_consent',
        headers,
        sampleRows: aiSampleRows,
        headerFingerprint: fingerprint,
      };
    }
    if (!(await this.consumeInferenceQuota(accountId))) return picker();

    const inferred = await this.statementAi.inferMapping(headers, aiSampleRows);
    if (!inferred) return picker();

    const parsed = runUniversal(
      inferred.mapping, inferred.amountFormat, inferred.dateFormat, delimiter, defaultCurrency,
    );
    if (!parsed || parsed.rows.length === 0) {
      // The mapping is plausible but produced nothing — hand it to the manual
      // mapper pre-filled so the user corrects one column, not six. Do NOT
      // store a signature that has never parsed a row.
      return {
        status: 'needs_mapping',
        headers,
        sampleRows: aiSampleRows,
        headerFingerprint: fingerprint,
        aiInferred: true,
        aiMapping: inferred.mapping,
        aiBankLabel: inferred.bankLabel,
      };
    }

    await this.signatures.record({
      headerFingerprint: fingerprint,
      mapping: inferred.mapping,
      delimiter,
      amountFormat: inferred.amountFormat,
      dateFormat: inferred.dateFormat,
      bankLabel: inferred.bankLabel,
    });

    const response = await this.buildPreviewResponse(
      accountId, universal, parsed.rows, countParseFailures(text, parsed.rows.length), fingerprint,
    );
    return {
      ...response,
      aiInferred: true,
      aiMapping: inferred.mapping,
      aiBankLabel: inferred.bankLabel,
      // Same parse-context echo as the signature-hit branch above.
      headers,
      sampleRows: aiSampleRows,
      delimiter,
      amountFormat: inferred.amountFormat,
      dateFormat: inferred.dateFormat,
      ...(inferred.mapping.currency ? {} : { currencyAssumed: defaultCurrency }),
    };
  }

  // NaN-guarded the same way MAX_INFERENCES_PER_DAY is: an unset or typo'd env
  // value must fall back to 20, not to NaN (`slice(0, NaN)` === `slice(0, 0)`,
  // which would silently disable PDF extraction entirely).
  private static readonly MAX_PDF_PAGES = parseInferenceQuotaEnv(process.env.AI_IMPORT_MAX_PDF_PAGES);

  /**
   * Cost (in AI usage units) of one PDF extraction — shared between the
   * pre-flight quota check and the post-success `trackAiUsage` call so the two
   * can never drift apart.
   */
  private static readonly AI_PDF_EXTRACTION_COST = 2.0;

  /**
   * `pdf-parse` only inserts a page-boundary marker when a `pageJoiner` is
   * explicitly requested (see `utils/pdf-text.ts`). This is that marker —
   * used both when re-extracting for pagination below and when splitting the
   * result back into pages.
   */
  private static readonly PAGE_JOINER = '\f';

  /**
   * PDF path: the model emits values here, so this is Pro-gated, usage-tracked
   * and reconciled against the statement balance. The tier check lives here
   * rather than on the route because it depends on the uploaded file type,
   * which a route decorator cannot see.
   */
  private async tryAiExtraction(
    accountId: string,
    userId: string,
    text: string,
    lines: string[],
    fileBuffer: Buffer,
  ): Promise<BankImportPreviewResponse> {
    const picker = (): BankImportPreviewResponse => ({
      status: 'needs_picker',
      headers: lines.slice(0, 20),
      sampleRows: [],
      supportedBanks: PARSERS.filter((p) => p.id !== 'ai' && (p.format ?? 'csv') === 'pdf').map((p) => ({
        id: p.id,
        displayName: p.displayName,
      })),
    });

    if (!this.statementAi.isEnabled()) return picker();

    const consent = await this.resolveAiConsent(accountId);
    if (consent === 'unsupported') return picker();
    if (consent === 'needs_consent') {
      return { status: 'needs_ai_consent', headers: lines.slice(0, 20), sampleRows: [] };
    }

    // 403, not 400 — this is the shape SubscriptionTierGuard throws and the
    // shape the mobile client detects to open the paywall.
    const subscription = await this.subscriptions.getCurrent(userId);
    if (subscription.tier !== 'pro' && subscription.tier !== 'business') {
      throw new ForbiddenException({
        code: 'TIER_REQUIRED',
        requiredTier: 'pro',
        currentTier: subscription.tier,
        message: 'AI PDF statement import requires Pro',
      });
    }

    // Pre-check the monthly AI quota BEFORE spending anything: several LLM
    // calls (one per page) are about to run, and a request that cannot be
    // served must never be paid for. This is a plain read (no increment) —
    // `trackAiUsage` below still does its own atomic check-and-increment
    // after a successful extraction, which is what actually bills the user
    // and also protects against a race between this check and that call.
    const usage = await this.subscriptions.getUsageStats(userId);
    if (usage.aiRequestsLimit !== -1 && usage.aiRequestsUsed + ImportBankService.AI_PDF_EXTRACTION_COST > usage.aiRequestsLimit) {
      throw new ForbiddenException({
        code: 'TIER_REQUIRED',
        requiredTier: subscription.tier === 'pro' ? 'business' : 'pro',
        currentTier: subscription.tier,
        message: 'AI usage limit reached for this billing period',
      });
    }

    // Re-extract with an explicit page-joiner so pages can actually be
    // counted and capped. `text` (already extracted with no joiner, above in
    // parsePdfPreview) keeps its original shape for the balance-reconciliation
    // regexes below — only this local `paginated` copy is page-delimited.
    //
    // Mirrors the identical call in parsePdfPreview: an unhandled throw here
    // would escape as a 500, violating "never a 5xx from the AI path" — so a
    // failure degrades to the manual picker exactly like every other AI-path
    // failure, instead of crashing the request.
    let paginated: string;
    try {
      paginated = await extractPdfText(fileBuffer, ImportBankService.PAGE_JOINER);
    } catch (e: any) {
      this.logger.warn(`PDF re-extraction for pagination failed: ${e?.message ?? e}`);
      return picker();
    }
    const allPages = paginated.split(ImportBankService.PAGE_JOINER).filter((p) => p.trim());
    const pages = allPages.slice(0, ImportBankService.MAX_PDF_PAGES);
    const droppedPages = allPages.length - pages.length;

    const rows = await this.statementAi.extractRows(pages);
    if (rows.length === 0) {
      // The page count was already known even though extraction produced
      // nothing — a large statement whose first N pages happen to yield no
      // rows must still say so, not return a bare needs_picker as if nothing
      // had been dropped.
      return {
        ...picker(),
        ...(droppedPages > 0 ? { extractionWarning: 'pages_truncated' as const, droppedPages } : {}),
      };
    }

    await this.subscriptions.trackAiUsage(userId, 'ocr', ImportBankService.AI_PDF_EXTRACTION_COST, accountId);

    const parsed = toParserResult(rows);
    const aiParser = getParserById('ai')!;
    const response = await this.buildPreviewResponse(accountId, aiParser, parsed.rows, 0);

    const warning = droppedPages > 0
      ? ('pages_truncated' as const)
      : reconcile(rows, findStatementBalances(text));

    return {
      ...response,
      aiInferred: true,
      ...(warning ? { extractionWarning: warning } : {}),
      ...(droppedPages > 0 ? { droppedPages } : {}),
    };
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
      return this.tryAiExtraction(accountId, userId, text, lines, fileBuffer);
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

    // Tier 2 — suggest-merge: flag rows that match an existing account expense
    // under predicate Q (same payee + date ±1d, DIFFERENT currency). Only
    // non-alreadyImported expense rows are eligible. Does NOT touch importable/
    // skipped counts — possibleMerge rows still import as new by default.
    await this.flagPossibleMerges(accountId, paired);

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

  /**
   * Tier 2 — predicate Q suggest-merge pass.
   * For each NON-alreadyImported expense row, query existing account expenses
   * that match on payee + date ±1d + DIFFERENT currency. Sets possibleMerge:true
   * and mergeCandidateIds on matching rows. Does NOT change alreadyImported,
   * importable, or skipped counts — the row still imports as new by default.
   * P and Q are mutually exclusive (same vs different currency), so a row
   * that content-deduped under P cannot also Q-match the same expense.
   */
  private async flagPossibleMerges(accountId: string, rows: ImportRow[]): Promise<void> {
    const eligible = rows.filter((r) => !r.alreadyImported && r.kind === 'expense');
    if (eligible.length === 0) return;

    const isoDates = [...new Set(eligible.map((r) => r.date))].filter(Boolean).sort();
    if (isoDates.length === 0) return;

    // Build a date window spanning all eligible rows' ±1 day.
    const allMs = isoDates.map((d) => new Date(d).getTime());
    const minDate = new Date(Math.min(...allMs) - DUP_DAY_MS);
    const maxDate = new Date(Math.max(...allMs) + DUP_DAY_MS);

    const existing = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, date: { gte: minDate, lte: maxDate } },
      select: { id: true, date: true, merchant: true, description: true, currencyCode: true },
    });

    for (const r of eligible) {
      const label = expensePayee({ merchant: r.merchant, description: r.description });
      if (!label) continue;

      const rowDateMs = new Date(r.date).getTime();
      const matches = existing.filter(
        (e) =>
          expensePayee({ merchant: e.merchant, description: e.description }) === label &&
          e.currencyCode !== r.currencyCode && // Q: currencies DIFFER
          Math.abs(new Date(e.date).getTime() - rowDateMs) <= DUP_DAY_MS,
      );

      if (matches.length > 0) {
        r.possibleMerge = true;
        r.mergeCandidateIds = matches.map((m) => m.id);
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
    const merchantRulesMap = await this.merchantRules.getRulesMap(accountId);

    // Pre-filter duplicate externalRefs BEFORE opening the transaction (ABA-313).
    // Postgres aborts the ENTIRE transaction on the first unique-constraint
    // violation (`account_id, external_ref`); every subsequent statement then
    // fails with 25P02 ("current transaction is aborted"). So catching P2002 and
    // continuing inside the tx crashes the whole import. Removing duplicates up
    // front — both already-in-DB and repeats within this batch — means the
    // constraint never fires. (Covers the gaps the preview's alreadyImported flag
    // misses: intra-file repeats, and rows imported between preview and commit.)
    const rowsToInsert = await this.dropDuplicateRows(accountId, toImport);
    skippedDuplicates += toImport.length - rowsToInsert.length;

    await this.prisma.$transaction(async (tx) => {
      batchId = await this.importBatches.createBatch(tx as any, { accountId, userId, source });

      for (const row of rowsToInsert) {
        try {
          if (row.kind === 'expense') {
            // Apply user's learned merchant rule (higher priority than parser-suggested category)
            const normalizedMerchant = row.merchant?.trim().toLowerCase();
            const userRuleCategoryId = normalizedMerchant ? merchantRulesMap.get(normalizedMerchant) ?? null : null;

            const categoryId = userRuleCategoryId ?? await this.resolveCategoryId(
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
      const isCorrection = await this.isMappingCorrection(dto.headerFingerprint, dto.mapping);
      if (isCorrection) {
        void this.signatures.markCorrected(dto.headerFingerprint).catch(() => {});
      } else {
        // Fire-and-forget: never allowed to fail an import that already succeeded.
        void this.signatures.confirm(dto.headerFingerprint).catch(() => {});
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

  /**
   * True when `mapping` structurally differs from the mapping the global
   * signature dictionary currently serves for `headerFingerprint` — i.e. the
   * user re-mapped what the dictionary offered, rather than merely accepting
   * it (whether or not they ever visited the mapper). No stored signature at
   * all (never inferred, or currently quarantined — `signatures.find` hides
   * a quarantined row) is treated as "nothing to correct against", matching
   * the confirm-by-default behavior for a manually-mapped file that was
   * never AI-inferred in the first place. `mapping` is optional on the DTO —
   * a commit with a fingerprint but no mapping (should not normally happen,
   * but is not itself an error) also confirms rather than throwing.
   */
  private async isMappingCorrection(
    headerFingerprint: string,
    mapping: import('@budget/shared-types').ColumnMapping | undefined,
  ): Promise<boolean> {
    if (!mapping) return false;
    try {
      const stored = await this.signatures.find(headerFingerprint);
      return !!stored && !columnMappingsEqual(stored.mapping, mapping);
    } catch {
      // Bookkeeping must never fail an import that already succeeded.
      return false;
    }
  }

  /**
   * Remove rows whose externalRef already exists in this account (expense /
   * income / currency exchange) or repeats earlier in the same batch, so the
   * unique `(account_id, external_ref)` constraint can't fire inside the commit
   * transaction (which Postgres would otherwise abort wholesale — ABA-313). Rows
   * without an externalRef are always kept (nothing to collide on).
   */
  private async dropDuplicateRows<T extends { externalRef?: string | null }>(
    accountId: string,
    rows: T[],
  ): Promise<T[]> {
    const refs = Array.from(
      new Set(rows.map((r) => r.externalRef).filter((r): r is string => !!r)),
    );
    const existing = new Set<string>();
    if (refs.length) {
      const [exExp, exInc, exFx] = await Promise.all([
        this.prisma.expense.findMany({ where: { accountId, externalRef: { in: refs } }, select: { externalRef: true } }),
        this.prisma.income.findMany({ where: { accountId, externalRef: { in: refs } }, select: { externalRef: true } }),
        this.prisma.currencyExchange.findMany({ where: { accountId, externalRef: { in: refs } }, select: { externalRef: true } }),
      ]);
      for (const e of [...exExp, ...exInc, ...exFx]) {
        if (e.externalRef) existing.add(e.externalRef);
      }
    }
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const ref = row.externalRef;
      if (ref) {
        if (existing.has(ref) || seen.has(ref)) continue;
        seen.add(ref);
      }
      out.push(row);
    }
    return out;
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

function peekHeaders(text: string, delimiter = ';'): string[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter,
    preview: 1,
  });
  const first = result.data[0];
  return first ? first.map((h) => String(h).trim()) : [];
}

function peekSampleRows(text: string, count: number, delimiter = ';'): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter,
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

/**
 * Parse `AI_IMPORT_MAX_INFERENCES_PER_DAY`, falling back to 20 when the env
 * var is unset OR set to something non-numeric. `Number(undefined)` and
 * `Number('garbage')` both yield `NaN`, and `used >= NaN` is always `false` —
 * without this guard a typo'd env value silently removes the daily abuse
 * ceiling instead of falling back to the documented default.
 */
export function parseInferenceQuotaEnv(raw: string | undefined, fallback = 20): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
