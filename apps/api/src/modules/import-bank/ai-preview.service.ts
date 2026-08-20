import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { SignatureService } from './ai/signature.service';
import { StatementAiService } from './ai/statement-ai.service';
import { MAX_SAMPLE_ROWS } from './ai/statement-ai.prompt';
import { columnMappingsEqual } from './utils/column-mapping';
import { peekSampleRows, countParseFailures } from './utils/csv-preview';
import { PARSERS, getParserById } from './parsers/registry';
import { ImportBankDedupService } from './import-bank-dedup.service';
import type { PreviewOptions } from './import-bank.service';
import type { BankImportPreviewResponse } from '@budget/shared-types';

/**
 * AI CSV/XLSX mapping-inference concern, split out of ImportBankService (see
 * "Expenses service split (ABA-368)" convention in CLAUDE.md). Owns the last
 * two links in the parser-resolution chain — the global signature dictionary,
 * then LLM inference — plus the account-wide AI-import consent state that
 * gates them.
 */
@Injectable()
export class ImportBankAiPreviewService {
  private static readonly MAX_INFERENCES_PER_DAY = parseInferenceQuotaEnv(
    process.env.AI_IMPORT_MAX_INFERENCES_PER_DAY,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly signatures: SignatureService,
    private readonly statementAi: StatementAiService,
    private readonly dedup: ImportBankDedupService,
  ) {}

  /**
   * Last two links in the parser-resolution chain: the global signature
   * dictionary, then LLM inference. Returns a fully-built preview on success
   * and degrades to needs_ai_consent / needs_mapping / needs_picker otherwise.
   */
  async tryAiMapping(
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
        const response = await this.dedup.buildPreviewResponse(
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

    const response = await this.dedup.buildPreviewResponse(
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
  async resolveAiConsent(accountId: string): Promise<'ok' | 'needs_consent' | 'unsupported'> {
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
    if (used >= ImportBankAiPreviewService.MAX_INFERENCES_PER_DAY) return false;
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
  async isMappingCorrection(
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
