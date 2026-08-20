import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { extractPdfText } from './utils/pdf-text';
import { toParserResult } from './parsers/ai-statement.parser';
import { findStatementBalances, reconcile } from './ai/balance-check';
import { StatementAiService } from './ai/statement-ai.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PARSERS, getParserById } from './parsers/registry';
import { ImportBankAiPreviewService, parseInferenceQuotaEnv } from './ai-preview.service';
import { ImportBankDedupService } from './import-bank-dedup.service';
import type { BankImportPreviewResponse } from '@budget/shared-types';

/**
 * AI PDF-extraction concern, split out of ImportBankService (see "Expenses
 * service split (ABA-368)" convention in CLAUDE.md). PDF path: the model
 * emits values here, so this is Pro-gated, usage-tracked and reconciled
 * against the statement balance.
 */
@Injectable()
export class ImportBankAiPdfService {
  private readonly logger = new Logger(ImportBankAiPdfService.name);

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

  constructor(
    private readonly statementAi: StatementAiService,
    private readonly subscriptions: SubscriptionsService,
    private readonly aiPreview: ImportBankAiPreviewService,
    private readonly dedup: ImportBankDedupService,
  ) {}

  /**
   * PDF path: the model emits values here, so this is Pro-gated, usage-tracked
   * and reconciled against the statement balance. The tier check lives here
   * rather than on the route because it depends on the uploaded file type,
   * which a route decorator cannot see.
   */
  async tryAiExtraction(
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

    const consent = await this.aiPreview.resolveAiConsent(accountId);
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
    if (usage.aiRequestsLimit !== -1 && usage.aiRequestsUsed + ImportBankAiPdfService.AI_PDF_EXTRACTION_COST > usage.aiRequestsLimit) {
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
      paginated = await extractPdfText(fileBuffer, ImportBankAiPdfService.PAGE_JOINER);
    } catch (e: any) {
      this.logger.warn(`PDF re-extraction for pagination failed: ${e?.message ?? e}`);
      return picker();
    }
    const allPages = paginated.split(ImportBankAiPdfService.PAGE_JOINER).filter((p) => p.trim());
    const pages = allPages.slice(0, ImportBankAiPdfService.MAX_PDF_PAGES);
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

    await this.subscriptions.trackAiUsage(userId, 'ocr', ImportBankAiPdfService.AI_PDF_EXTRACTION_COST, accountId);

    const parsed = toParserResult(rows);
    const aiParser = getParserById('ai')!;
    const response = await this.dedup.buildPreviewResponse(accountId, aiParser, parsed.rows, 0);

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
}
