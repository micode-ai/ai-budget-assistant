import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import {
  CommunityPriceService,
  type ContributionOutcome,
} from '../../community-prices/community-price.service';
import { OcrService } from './ocr.service';

/** Only receipts this recent can still contribute (mirrors the contribution path's 14-day gate). */
const RESCAN_WINDOW_DAYS = 14;
/** Stop OCR for a contributor after this many contributions in one run (the daily rate limit). */
const PER_USER_RUN_CAP = 6;
/** A receipt with a final outcome is not read again for this long (longer than the window). */
const DONE_TTL_SEC = 15 * 86_400;
const LAST_RUN_TTL_SEC = 7 * 86_400;
const DAY_MS = 86_400_000;
const LAST_RUN_KEY = 'cp:rescan:last';
const RUNNING_KEY = 'cp:rescan:running';

/** Outcomes worth retrying on a later run: the receipt itself was fine. */
type RescanOutcome = ContributionOutcome | 'ocr_failed' | 'not_attested';
const RETRYABLE: ReadonlySet<RescanOutcome> = new Set(['rate_limited', 'failed', 'ocr_failed']);

export interface ReceiptRescanFilter {
  /** Limit to these users; default = every user who consented to contribute. */
  emails?: string[];
  /** List the candidates without reading or contributing anything. */
  dryRun?: boolean;
}

export interface ReceiptRescanReport {
  startedAt: string;
  finishedAt: string | null;
  dryRun: boolean;
  candidates: number;
  outcomes: Record<string, number>;
  perUser: Record<string, Record<string, number>>;
}

/**
 * One-off backfill for the community price map (ABA-642 follow-up): receipts saved
 * before their owner consented never carried a scan attestation, so they could not
 * contribute. This reads each recent stored receipt image again with the server's
 * own OCR (which issues a fresh attestation exactly as a live scan does) and hands
 * it to `CommunityPriceService.contributeRescannedReceipt`, where every gate —
 * consent, 14-day recency, eligibility, one receipt once, rate limits — still
 * applies. Images only: a PDF is skipped, as is an E2EE account.
 *
 * Runs in the background (a run takes minutes; one OCR call per receipt, sequential
 * so the Nominatim throttle and OpenAI stay paced); the report is kept in Redis.
 */
@Injectable()
export class ReceiptRescanService {
  private readonly logger = new Logger(ReceiptRescanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ocr: OcrService,
    private readonly communityPrices: CommunityPriceService,
  ) {}

  async lastReport(): Promise<ReceiptRescanReport | null> {
    return this.cache.get<ReceiptRescanReport>(LAST_RUN_KEY);
  }

  /** Start a run; returns at once with the candidate count, or `alreadyRunning`. */
  async start(filter: ReceiptRescanFilter): Promise<{ started: boolean; alreadyRunning?: boolean; candidates: number }> {
    if (!(await this.cache.setIfAbsent(RUNNING_KEY, 60 * 60))) {
      return { started: false, alreadyRunning: true, candidates: 0 };
    }
    const candidates = await this.findCandidates(filter.emails);
    void this.run(candidates, !!filter.dryRun)
      .catch(logFireAndForget(this.logger, 'ReceiptRescanService.run'))
      .finally(() => this.cache.del(RUNNING_KEY).catch(logFireAndForget(this.logger, 'ReceiptRescanService.unlock')));
    return { started: true, candidates: candidates.length };
  }

  private async findCandidates(emails?: string[]) {
    const since = new Date(Date.now() - RESCAN_WINDOW_DAYS * DAY_MS);
    const wanted = (emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const rows = await this.prisma.expense.findMany({
      where: {
        isDeleted: false,
        receiptImage: { not: null },
        date: { gte: since },
        account: { encryptionEnabled: false },
        user: {
          contributeCommunityPrices: true,
          ...(wanted.length > 0 ? { email: { in: wanted, mode: 'insensitive' as const } } : {}),
        },
      },
      select: { id: true, accountId: true, userId: true, receiptMimeType: true, user: { select: { email: true } } },
      orderBy: { date: 'desc' },
    });
    const pending: typeof rows = [];
    for (const r of rows) {
      if (!(await this.cache.get<boolean>(this.doneKey(r.id)))) pending.push(r);
    }
    return pending;
  }

  private async run(candidates: Awaited<ReturnType<ReceiptRescanService['findCandidates']>>, dryRun: boolean) {
    const report: ReceiptRescanReport = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      dryRun,
      candidates: candidates.length,
      outcomes: {},
      perUser: {},
    };
    const count = (email: string, outcome: string) => {
      report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1;
      const u = (report.perUser[email] ??= {});
      u[outcome] = (u[outcome] ?? 0) + 1;
    };
    const contributedBy = new Map<string, number>();
    const stopped = new Set<string>();

    for (const c of candidates) {
      const email = c.user?.email ?? c.userId;
      if (dryRun) {
        count(email, 'candidate');
        continue;
      }
      if (stopped.has(c.userId)) {
        count(email, 'deferred');
        continue;
      }
      const mime = c.receiptMimeType ?? 'image/jpeg';
      if (!mime.startsWith('image/')) {
        count(email, 'not_image');
        await this.markDone(c.id);
        continue;
      }

      const outcome = await this.rescanOne(c.id, c.accountId, c.userId, mime);
      count(email, outcome);
      if (!RETRYABLE.has(outcome)) await this.markDone(c.id);
      if (outcome === 'contributed') {
        const n = (contributedBy.get(c.userId) ?? 0) + 1;
        contributedBy.set(c.userId, n);
        if (n >= PER_USER_RUN_CAP) stopped.add(c.userId);
      }
      if (outcome === 'rate_limited') stopped.add(c.userId);
      await this.cache.set(LAST_RUN_KEY, report, LAST_RUN_TTL_SEC);
    }

    report.finishedAt = new Date().toISOString();
    await this.cache.set(LAST_RUN_KEY, report, LAST_RUN_TTL_SEC);
    this.logger.log(`[ReceiptRescan] done: ${JSON.stringify(report.outcomes)}`);
  }

  private async rescanOne(
    expenseId: string,
    accountId: string,
    userId: string,
    mime: string,
  ): Promise<RescanOutcome> {
    const row = await this.prisma.expense.findUnique({ where: { id: expenseId }, select: { receiptImage: true } });
    if (!row?.receiptImage) return 'no_expense';
    const base64 = Buffer.from(row.receiptImage).toString('base64');

    let receipt;
    try {
      receipt = await this.ocr.parseReceipt(base64, userId, accountId, undefined, `data:${mime};base64,${base64}`);
    } catch (e) {
      this.logger.warn(`[ReceiptRescan] OCR failed for ${expenseId}: ${e instanceof Error ? e.message : String(e)}`);
      return 'ocr_failed';
    }
    if (!receipt.scanAttestation) return 'not_attested';

    const lines = (receipt.receiptItems ?? []).map((i) => ({
      canonicalName: i.canonicalName,
      // Same quantity default the attestation hashed with.
      quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
      totalPrice: Number(i.totalPrice),
    }));
    return this.communityPrices.contributeRescannedReceipt(accountId, userId, expenseId, receipt.scanAttestation, lines);
  }

  private doneKey(expenseId: string): string {
    return `cp:rescan:done:${expenseId}`;
  }

  private markDone(expenseId: string): Promise<void> {
    return this.cache.set(this.doneKey(expenseId), true, DONE_TTL_SEC);
  }
}
