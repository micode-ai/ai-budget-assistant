import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { ReceiptDuplicateService, receiptFingerprint } from '../expenses/receipt-duplicate.service';
import { InboundMailAddressService, tokenCapKeys } from './inbound-mail-address.service';
import { InboundReceiptProcessorService } from './inbound-receipt-processor.service';
import { HandoffPayload, HandoffPayloadSchema } from './dto';
import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_CHARS,
  RECEIPT_RETENTION_MS,
  TIER1_RECEIPT_RETENTION_MS,
  TOKEN_DAILY_MAX,
  TOKEN_HOURLY_MAX,
  VERIFICATION_RETENTION_MS,
  isInboundMailEnabled,
} from './inbound-mail.config';
import { inboundDedupKey, sniffDocument, textContentHash, tokenLogId } from './inbound-mail.util';
import type {
  InboundReceiptDetail,
  InboundReceiptListItem,
  InboundReceiptKind,
  InboundReceiptStatus,
  InboundDocumentKind,
} from '@budget/shared-types';

const HANDLED_STATUSES = ['duplicate', 'not_a_receipt', 'quota_exceeded', 'unsupported', 'failed'];
const RETRYABLE_STATUSES = ['quota_exceeded', 'failed'];

interface ReceiptRow {
  id: string;
  status: string;
  kind: string;
  fromAddress: string;
  subject: string | null;
  documentKind: string | null;
  documentMime: string | null;
  document?: unknown;
  documentText?: string | null;
  authDmarc?: string | null;
  extraction: unknown;
  verificationCode: string | null;
  expenseId: string | null;
  errorCode: string | null;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class InboundReceiptService {
  private readonly logger = new Logger(InboundReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly addresses: InboundMailAddressService,
    private readonly processor: InboundReceiptProcessorService,
    private readonly duplicates: ReceiptDuplicateService,
  ) {}

  // ----- ingest (SMTP container) ---------------------------------------------

  /**
   * Persists one forwarded message as `received` and answers; the AI work runs
   * afterwards, off the SMTP path. Returns `{ id, duplicate:false }`; throws
   * 409 (same Message-ID already stored), 422 (nothing usable; recorded as
   * `unsupported`), 429 (per-token cap), 404 (flag off / unknown token), 503.
   */
  async ingest(raw: unknown): Promise<{ id: string }> {
    if (!isInboundMailEnabled(this.config)) throw new NotFoundException();

    const parsed = HandoffPayloadSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Invalid handoff payload');
    const payload = parsed.data;

    const active = await this.addresses.resolveActive(payload.token);
    if (!active) throw new NotFoundException();

    // Caps are enforced ATOMICALLY here: increment first, then compare (INCR is the
    // reservation), so N concurrent messages cannot all pass a peek and exceed the cap.
    // RCPT only peeks. Redis down => 503, never accept.
    const keys = tokenCapKeys(active.token);
    try {
      const [hourly, daily] = await Promise.all([
        this.cache.incrementWindow(keys.hourly, 3_600_000),
        this.cache.incrementWindow(keys.daily, 86_400_000),
      ]);
      if (hourly > TOKEN_HOURLY_MAX || daily > TOKEN_DAILY_MAX) {
        throw new HttpException('Per-address limit reached', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`ingest cap check failed (token ${tokenLogId(active.token)}): ${(err as Error).message}`);
      throw new ServiceUnavailableException();
    }

    const now = Date.now();
    const base = {
      userId: active.userId,
      accountId: active.targetAccountId,
      messageIdHash: payload.messageIdHash,
      fromAddress: payload.fromAddress.slice(0, 320),
      subject: payload.subject ? payload.subject.slice(0, 200) : null,
      authSpf: payload.auth.spf.slice(0, 32),
      authDkim: payload.auth.dkim.join(',').slice(0, 200),
      authDmarc: payload.auth.dmarc.slice(0, 32),
      ignoredAttachmentCount: payload.ignoredAttachmentCount,
    };

    let data: Record<string, unknown>;
    let unsupported = false;

    if (payload.kind === 'forwarding_verification') {
      if (!payload.verificationCode) throw new BadRequestException('Missing verification code');
      data = {
        ...base,
        kind: 'forwarding_verification' satisfies InboundReceiptKind,
        verificationCode: payload.verificationCode,
        expiresAt: new Date(now + VERIFICATION_RETENTION_MS),
      };
    } else {
      const doc = this.validateDocument(payload.document);
      const expiresAt = new Date(now + (active.accountTier >= 1 ? TIER1_RECEIPT_RETENTION_MS : RECEIPT_RETENTION_MS));
      if (!doc) {
        unsupported = true;
        data = { ...base, kind: 'receipt', status: 'unsupported' satisfies InboundReceiptStatus, expiresAt };
      } else {
        data = { ...base, kind: 'receipt', expiresAt, ...doc };
        data.messageIdHash = inboundDedupKey(payload.messageIdHash, doc.contentHash as string);
      }
    }

    let id: string;
    try {
      const row = await this.prisma.inboundReceipt.create({ data: data as never, select: { id: true } });
      id = row.id;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new ConflictException('Duplicate message');
      throw err;
    }

    if (payload.kind === 'forwarding_verification') {
      // Only the newest forwarding code per address is kept (older ones are stale and
      // would otherwise pile up as guessable-looking codes).
      await this.prisma.inboundReceipt.deleteMany({
        where: { userId: active.userId, kind: 'forwarding_verification', id: { not: id } },
      });
    }

    if (unsupported) throw new UnprocessableEntityException({ id, message: 'No usable content' });

    void this.processor.process(id).catch(logFireAndForget(this.logger, 'InboundReceiptService.process'));
    return { id };
  }

  /**
   * Re-validates the container's document (the container faces the internet, so
   * the API does not trust its claims): magic bytes decide the kind, byte caps
   * apply after decoding, and the content hash is recomputed here.
   */
  private validateDocument(document: HandoffPayload['document']): Record<string, unknown> | null {
    if (!document) return null;

    if (document.kind === 'text') {
      const text = (document.text ?? '').slice(0, MAX_TEXT_CHARS);
      if (text.trim().length === 0) return null;
      return {
        documentKind: 'text' satisfies InboundDocumentKind,
        documentMime: 'text/plain',
        documentText: text,
        contentHash: textContentHash(text),
      };
    }

    const base64 = (document.base64 ?? '').replace(/\s/g, '');
    if (!base64) return null;
    const bytes = Buffer.from(base64, 'base64');
    const sniffed = sniffDocument(bytes);
    if (!sniffed) return null;
    const cap = sniffed.kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    if (bytes.length > cap) return null;
    return {
      documentKind: sniffed.kind,
      documentMime: sniffed.mimeType,
      document: bytes,
      // Same rule as ABA-603: SHA-256 of the base64 TEXT, so a PDF forwarded by mail and
      // the same PDF shared to the app fingerprint identically.
      contentHash: receiptFingerprint(base64),
    };
  }

  // ----- user-facing -----------------------------------------------------------

  async list(accountId: string, userId: string, status: 'pending' | 'handled'): Promise<InboundReceiptListItem[]> {
    const rows = await this.prisma.inboundReceipt.findMany({
      where: {
        userId,
        accountId,
        kind: 'receipt',
        status: status === 'pending' ? 'pending' : { in: HANDLED_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: this.listSelect(),
    });
    return rows.map((r: ReceiptRow) => this.toListItem(r));
  }

  async countPending(accountId: string, userId: string): Promise<{ pending: number }> {
    const pending = await this.prisma.inboundReceipt.count({
      where: { userId, accountId, kind: 'receipt', status: 'pending' },
    });
    return { pending };
  }

  async detail(accountId: string, userId: string, id: string): Promise<InboundReceiptDetail> {
    const row = await this.findOwned(accountId, userId, id);
    const extraction = (row.extraction ?? null) as Record<string, unknown> | null;
    return {
      ...this.toListItem(row),
      extraction,
      possibleDuplicate: extraction ? await this.recomputeDuplicate(accountId, extraction) : null,
      hasDocument: row.document != null || (row.documentText ?? null) !== null,
      documentMimeType: row.documentMime,
      expenseId: row.expenseId,
      // The container only reports `pass` for an ALIGNED DMARC result; anything else is unverified.
      senderVerified: (row.authDmarc ?? '').toLowerCase() === 'pass',
    };
  }

  async document(accountId: string, userId: string, id: string): Promise<{ mimeType: string; body: Buffer }> {
    const row = await this.findOwned(accountId, userId, id);
    if (row.document) {
      return { mimeType: row.documentMime ?? 'application/octet-stream', body: Buffer.from(row.document as Uint8Array) };
    }
    if (row.documentText) return { mimeType: 'text/plain; charset=utf-8', body: Buffer.from(row.documentText, 'utf8') };
    throw new GoneException('The document is no longer stored');
  }

  /** Idempotent. Resolves the expense by server PK or clientId inside the caller's account. */
  async confirm(accountId: string, userId: string, id: string, expenseRef: string): Promise<void> {
    const row = await this.findOwned(accountId, userId, id);
    if (row.status === 'confirmed') return;
    if (row.status !== 'pending') throw new ConflictException('This item is not awaiting confirmation');

    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: expenseRef }, { clientId: expenseRef }] },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    // One expense can back only one inbound receipt.
    const linked = await this.prisma.inboundReceipt.findFirst({
      where: { expenseId: expense.id, id: { not: id } },
      select: { id: true },
    });
    if (linked) throw new ConflictException('This expense is already linked to another e-receipt');

    // Scoped write: only the owner's pending row in this account can transition.
    await this.prisma.inboundReceipt.updateMany({
      where: { id, userId, accountId, status: 'pending' },
      data: { status: 'confirmed', expenseId: expense.id, document: null, documentText: null },
    });
  }

  async dismiss(accountId: string, userId: string, id: string): Promise<void> {
    const row = await this.findOwned(accountId, userId, id);
    if (row.status === 'dismissed' || row.status === 'confirmed') return;
    await this.prisma.inboundReceipt.updateMany({
      where: { id, userId, accountId, status: { not: 'confirmed' } },
      data: { status: 'dismissed', document: null, documentText: null },
    });
  }

  /** From quota_exceeded / failed only. The caller's AiUsageGuard has already charged the quota. */
  async retry(accountId: string, userId: string, id: string): Promise<InboundReceiptDetail> {
    const row = await this.findOwned(accountId, userId, id);
    if (!RETRYABLE_STATUSES.includes(row.status)) throw new ConflictException('This item cannot be retried');
    const hasContent = row.document != null || (row.documentText ?? null) !== null;
    if (!hasContent) throw new GoneException('The document is no longer stored');

    const claimed = await this.prisma.inboundReceipt.updateMany({
      where: { id, userId, accountId, status: { in: RETRYABLE_STATUSES } },
      data: { status: 'received', attempts: 0, errorCode: null },
    });
    if (claimed.count === 0) throw new ConflictException('This item cannot be retried');

    await this.processor.process(id, { prepaid: true });
    return this.detail(accountId, userId, id);
  }

  // ----- helpers ---------------------------------------------------------------

  /** `id AND userId AND accountId`; a miss is 404, never 403. */
  private async findOwned(accountId: string, userId: string, id: string) {
    const row = await this.prisma.inboundReceipt.findFirst({ where: { id, userId, accountId } });
    if (!row) throw new NotFoundException('Inbound receipt not found');
    return row;
  }

  private async recomputeDuplicate(accountId: string, extraction: Record<string, unknown>) {
    const fingerprint = typeof extraction.fingerprint === 'string' ? extraction.fingerprint : '';
    const byFile = fingerprint ? await this.duplicates.findByFingerprint(accountId, fingerprint) : null;
    if (byFile) return byFile;
    return this.duplicates.findLikely(accountId, {
      merchant: (extraction.merchant as string | null) ?? null,
      description: (extraction.description as string | null) ?? null,
      amount: Number(extraction.amount ?? 0),
      currencyCode: String(extraction.currencyCode ?? ''),
      date: (extraction.date as string | null) ?? null,
    });
  }

  private listSelect() {
    return {
      id: true,
      status: true,
      kind: true,
      fromAddress: true,
      subject: true,
      documentKind: true,
      documentMime: true,
      extraction: true,
      verificationCode: true,
      expenseId: true,
      errorCode: true,
      createdAt: true,
      expiresAt: true,
    } as const;
  }

  private toListItem(row: ReceiptRow): InboundReceiptListItem {
    const extraction = (row.extraction ?? null) as Record<string, unknown> | null;
    const at = row.fromAddress.lastIndexOf('@');
    return {
      id: row.id,
      status: row.status as InboundReceiptStatus,
      kind: row.kind as InboundReceiptKind,
      fromAddress: row.fromAddress,
      fromDomain: at >= 0 ? row.fromAddress.slice(at + 1).toLowerCase() : row.fromAddress.toLowerCase(),
      subject: row.subject,
      total: extraction && extraction.amount != null ? Number(extraction.amount) : null,
      currencyCode: extraction ? ((extraction.currencyCode as string | null) ?? null) : null,
      merchant: extraction ? ((extraction.merchant as string | null) ?? null) : null,
      date: extraction ? ((extraction.date as string | null) ?? null) : null,
      documentKind: (row.documentKind as InboundDocumentKind | null) ?? null,
      errorCode: row.errorCode,
      verificationCode: row.verificationCode,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
