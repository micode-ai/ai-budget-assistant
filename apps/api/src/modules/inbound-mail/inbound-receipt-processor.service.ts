import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { OcrService } from '../ai/services/ocr.service';
import type { ReceiptExpense } from '../ai/services/ocr.service';
import { ReceiptDuplicateService } from '../expenses/receipt-duplicate.service';
import { inboundMailPush } from './inbound-mail-push';
import { PUSH_THROTTLE_SEC, QUOTA_PUSH_THROTTLE_SEC, STUCK_AFTER_MS, isInboundMailEnabled } from './inbound-mail.config';
import { looksLikeReceiptText, senderDomain } from './inbound-mail.util';

/**
 * An e-mailed receipt is attacker-written, so NO scan path may mint a community
 * price attestation for it (ABA-642 audit HIGH 1) — passed on every OCR call.
 */
const NO_ATTEST = { attest: false } as const;

/** Same weight as a receipt scan (`@TrackAiUsage('ocr', 2.0)` on POST /ai/scan-receipt). */
export const INBOUND_OCR_COST_UNITS = 2.0;

export interface ProcessOptions {
  /** The caller already charged the quota (the retry route's AiUsageGuard). */
  prepaid?: boolean;
}

/**
 * dedup -> pre-filter -> quota -> extraction -> pending + push (spec "Processing
 * state machine"). Nothing here ever fetches anything named in a mail: the model
 * receives stripped plain text (`OcrService.parseReceiptText` removes URLs) or
 * the attachment's own bytes, and the sender's subject is never passed on.
 */
@Injectable()
export class InboundReceiptProcessorService {
  private readonly logger = new Logger(InboundReceiptProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly ocr: OcrService,
    private readonly duplicates: ReceiptDuplicateService,
  ) {}

  async process(id: string, options: ProcessOptions = {}): Promise<void> {
    if (!isInboundMailEnabled(this.config)) return;

    // Claim: only one worker moves a row out of received/processing. A `processing` row is
    // re-claimable only once it has been silent for STUCK_AFTER_MS: a row that is still being
    // worked (the claim bumps updatedAt) must not be re-run and charged a second time by the cron.
    const claim = await this.prisma.inboundReceipt.updateMany({
      where: {
        id,
        OR: [
          { status: 'received' },
          { status: 'processing', updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
        ],
      },
      data: { status: 'processing', attempts: { increment: 1 } },
    });
    if (claim.count === 0) return;

    const row = await this.prisma.inboundReceipt.findUnique({ where: { id } });
    if (!row) return;

    try {
      // The target account may have moved to tier 2 since the mail was accepted.
      const account = await this.prisma.account.findUnique({
        where: { id: row.accountId },
        select: { encryptionTier: true },
      });
      if (!account || account.encryptionTier >= 2) {
        await this.finish(id, 'failed', { errorCode: 'E2EE_UNSUPPORTED', clearDocument: true });
        return;
      }

      if (row.kind === 'forwarding_verification') {
        await this.finish(id, 'pending');
        // Never throttled: the user is waiting on this code.
        await this.pushSafely(row.userId, {
          title: inboundMailPush.verificationTitle(),
          body: inboundMailPush.verificationBody(),
          id,
        });
        return;
      }

      // Dedup, no AI.
      if (row.contentHash && (await this.isDuplicate(row.userId, row.accountId, id, row.contentHash))) {
        await this.finish(id, 'duplicate', { clearDocument: true });
        return;
      }

      // Not-a-receipt pre-filter, no AI.
      if (row.documentKind === 'text' && !looksLikeReceiptText(row.documentText ?? '')) {
        await this.finish(id, 'not_a_receipt', { clearDocument: true });
        return;
      }

      let charged = !!options.prepaid;
      if (!options.prepaid) {
        try {
          await this.subscriptions.trackAiUsage(row.userId, 'ocr', INBOUND_OCR_COST_UNITS, row.accountId);
        } catch (err) {
          if (err instanceof ForbiddenException) {
            await this.finish(id, 'quota_exceeded', { errorCode: 'QUOTA_EXCEEDED' });
            if (await this.cache.setIfAbsent(`inmail:quotapush:${row.userId}`, QUOTA_PUSH_THROTTLE_SEC)) {
              await this.pushSafely(row.userId, {
                title: inboundMailPush.quotaTitle(),
                body: inboundMailPush.quotaBody(),
                id,
              });
            }
            return;
          }
          throw err;
        }
        charged = true;
      }

      const extraction = await this.extract(row);
      if (!extraction || !(extraction.amount > 0)) {
        // The model said "not a receipt": do not bill the user for a mail they did not choose to scan.
        if (charged) await this.refundSafely(row.userId, row.accountId);
        await this.finish(id, 'not_a_receipt', { clearDocument: true });
        return;
      }

      const { possibleDuplicate: _ignored, scanAttestation: _att, ...stored } = extraction;
      void _ignored;
      void _att; // defence in depth: an inbound extraction NEVER carries a community scan token (ABA-642 audit)
      await this.finish(id, 'pending', { extraction: stored });
      await this.pushPendingThrottled(row.userId, id);
    } catch (err) {
      this.logger.warn(`process ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.finish(id, 'failed', { errorCode: 'EXTRACTION_FAILED' }).catch(() => undefined);
    }
  }

  private async extract(row: {
    userId: string;
    accountId: string;
    fromAddress: string;
    documentKind: string | null;
    documentMime: string | null;
    document: Uint8Array | null;
    documentText: string | null;
  }): Promise<ReceiptExpense | null> {
    // Neutral hint only. The subject is attacker-controlled text and is NOT passed.
    const hint = `Source: forwarded e-mail from ${senderDomain(row.fromAddress)}`;

    if (row.documentKind === 'text') {
      if (!row.documentText) return null;
      return this.ocr.parseReceiptText(row.documentText, row.userId, row.accountId, hint, {
        logTag: 'Email',
        scanOptions: NO_ATTEST,
      });
    }

    if (!row.document) return null;
    const base64 = Buffer.from(row.document).toString('base64');
    if (row.documentKind === 'pdf') {
      return this.ocr.parseReceiptPdf(base64, row.userId, row.accountId, hint, NO_ATTEST);
    }
    if (row.documentKind === 'image') {
      const mime = row.documentMime ?? 'image/jpeg';
      return this.ocr.parseReceipt(base64, row.userId, row.accountId, hint, `data:${mime};base64,${base64}`, NO_ATTEST);
    }
    return null;
  }

  private async isDuplicate(userId: string, accountId: string, id: string, contentHash: string): Promise<boolean> {
    const sameMail = await this.prisma.inboundReceipt.findFirst({
      where: { userId, contentHash, id: { not: id }, status: { in: ['pending', 'confirmed'] } },
      select: { id: true },
    });
    if (sameMail) return true;
    return (await this.duplicates.findByFingerprint(accountId, contentHash)) !== null;
  }

  private async finish(
    id: string,
    status: string,
    extra: { errorCode?: string; extraction?: unknown; clearDocument?: boolean } = {},
  ): Promise<void> {
    // Guarded on `processing`: a row the user dismissed (or the purge cron deleted) while the
    // model was running must never be resurrected by a late write.
    await this.prisma.inboundReceipt.updateMany({
      where: { id, status: 'processing' },
      data: {
        status,
        ...(extra.errorCode !== undefined ? { errorCode: extra.errorCode } : {}),
        ...(extra.extraction !== undefined ? { extraction: extra.extraction as never } : {}),
        ...(extra.clearDocument ? { document: null, documentText: null } : {}),
      },
    });
  }

  private async refundSafely(userId: string, accountId: string): Promise<void> {
    try {
      await this.subscriptions.refundAiUsage(userId, 'ocr', INBOUND_OCR_COST_UNITS, accountId);
    } catch (err) {
      this.logger.warn(`quota refund failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async pushPendingThrottled(userId: string, id: string): Promise<void> {
    // setIfAbsent returns false on a Redis outage, so the push is skipped, never repeated.
    if (!(await this.cache.setIfAbsent(`inmail:push:${userId}`, PUSH_THROTTLE_SEC))) return;
    const pending = await this.prisma.inboundReceipt.count({ where: { userId, kind: 'receipt', status: 'pending' } });
    await this.pushSafely(userId, {
      title: inboundMailPush.receiptsTitle(pending),
      body: inboundMailPush.receiptsBody(),
      id: pending === 1 ? id : undefined,
    });
  }

  private async pushSafely(
    userId: string,
    push: { title: (lang: string) => string; body: (lang: string) => string; id?: string },
  ): Promise<void> {
    try {
      await this.notifications.sendToUser(
        userId,
        push.title,
        push.body,
        push.id ? { inboundReceiptId: push.id } : {},
        'inbound_receipt',
      );
    } catch (err) {
      this.logger.warn(`push failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
