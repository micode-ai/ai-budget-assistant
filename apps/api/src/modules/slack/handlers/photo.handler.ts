import { ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { OcrService } from '../../ai/services/ocr.service';
import type { ReceiptExpense } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { ReceiptDuplicateService, receiptFingerprint, receiptMergeCandidate } from '../../expenses/receipt-duplicate.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { CategoriesService } from '../../categories/categories.service';
import { ShoppingListService } from '../../shopping-list/shopping-list.service';
import { SlackClientService } from '../slack-client.service';
import { SlackLinkService } from '../slack-link.service';
import { SLACK_REDIS, SlackFile, SlackUserState } from '../types';
import { t, buildCategorySplitLine, buildItemListBlock, buildShoppingListReconciliationLine } from '../helpers/i18n';
import { buildDuplicateLine, describeDuplicate } from '../../../common/bot-i18n/shared-messages';
import {
  parseItemEditCommand,
  applyItemEditCommand,
  recomputeSplits,
  seedItemGroups,
  type ItemEditCommand,
  type ItemEditError,
} from '../../../common/utils/receipt-item-edit';

import { buildItemCategoryMap, resolveProposedSplits } from '../../ai/utils/receipt-split-items';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import { CacheService } from '../../../common/cache/cache.service';
import type { ReceiptImagePart } from '@budget/shared-types';
import {
  MAX_BOT_PARTS,
  canBePart,
  continueReceiptWithPart,
  partRefusalMessage,
  pendingPointerKey,
  withReceiptLock,
} from '../../../common/bot-receipt-parts';

// Pending receipts live 30 min (`slack:receipt:*`); a long receipt's parts, the
// "continuation?" pointer and the photo parked by that question share the TTL.
const PENDING_RECEIPT_TTL_SEC = 1800;
const pendingReceiptKey = (shortId: string) => `slack:receipt:${shortId}`;
// A photo held back by the "continuation or new receipt?" question, so either
// answer needs no re-upload.
const questionScanKey = (tmpId: string) => `slack:scan:${tmpId}`;
// Held while one action owns a pending receipt (a continuation's model call, a
// save, a cancel) so none of them overwrites another's result.
const receiptBusyKey = (shortId: string) => `slack:receipt-busy:${shortId}`;

/** The image type from its first bytes (Slack's download carries no reliable type for a thumbnail). */
function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * A scan held back by the same-file duplicate warning (ABA-603), kept so
 * "Scan anyway" needs no re-upload. Mirrors Telegram's `PendingScanData`.
 */
interface PendingScanData {
  userId: string;
  accountId: string;
  /** Who sent the file: the "continuation?" pointer is per channel AND user. */
  slackUserId?: string;
  /** The image as a receipt PART when the original cannot be one (over the cap or
   * not an allowed type): Slack's own downscaled thumbnail. A scan still reads the original. */
  part?: ReceiptImagePart;
  slackTeamId: string;
  channel: string;
  base64: string;
  mimeType: string;
  language: string;
  /** The continuation question this image is parked under (shows progress, then is deleted). */
  questionTs?: string;
}

interface PendingReceiptData {
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  date: string | null;
  discountAmount: number | null;
  depositAmount: number | null;
  merchant: string | null;
  location?: { lat: number; lng: number; name?: string } | null;
  categorySplits?: ReceiptExpense['categorySplits'];
  items: Array<{
    description: string;
    /** Set by `seedItemGroups` on entering item-edit mode — the only handle on a
     * category the scan merely PROPOSED. Redis-only; the confirm path ignores it. */
    categoryName?: string | null;
    /** Category the scan classified this line into; survives even when the
     * receipt produced no money split. */
    categoryId?: string | null;
    canonicalName?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice: number;
  }>;
  /** Image parts, top to bottom; part 1 is the scanned file (also a PDF). The
   * one copy of the image — part 1 is not stored a second time. */
  parts: ReceiptImagePart[];
  /** Legacy (written before `parts` existed); read only as part 1's fallback. */
  receiptImageBase64?: string;
  receiptMimeType: string;
  receiptFingerprint?: string;
  /** The confirm card's message, so a continuation can update it in place. */
  cardTs?: string;
  /** The original upload, when part 1 is its thumbnail: saved as the image of a
   * single-photo receipt, exactly as before. A multi-part receipt saves the parts it read. */
  originalImage?: ReceiptImagePart;
  /** Server-signed scan token (ABA-642), handed back on create; never edited. */
  scanAttestation?: string;
  /** A bank or user-entered row this receipt may be folded into on save (ABA-744). */
  mergeCandidate?: { id: string; what: string };
  language: string;
}

@Injectable()
export class PhotoHandler {
  private readonly logger = new Logger(PhotoHandler.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly expensesService: ExpensesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly categoriesService: CategoriesService,
    private readonly shoppingListService: ShoppingListService,
    private readonly client: SlackClientService,
    private readonly chatActionRecorder: ChatActionRecorderService,
    private readonly linkService: SlackLinkService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
    // The long-receipt state (parts, pointer, parked photos, lock) goes through
    // CacheService; it is the same Redis and JSON encoding as `slack:receipt:*`.
    private readonly cache: CacheService,
    @Optional() private readonly receiptDuplicates?: ReceiptDuplicateService,
  ) {}

  /**
   * Several images in one message (ruling R2), handled one after another: the
   * first scans at once (when nothing is pending), each later one is offered
   * as a continuation of that receipt with its own question.
   */
  async handleImages(files: SlackFile[], userState: SlackUserState): Promise<void> {
    for (const file of files) {
      await this.handleImage(file, userState);
    }
  }

  async handleImage(file: SlackFile, userState: SlackUserState): Promise<void> {
    const { userId, accountId, channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      if (userState.accountRole === 'viewer') {
        await this.client.sendText(teamId, channel, t('viewerRestricted', language));
        return;
      }

      const imageUrl = file.url_private_download;
      if (!imageUrl) {
        this.logger.warn(`Image file ${file.id} has no url_private_download`);
        await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
        return;
      }

      const { buffer, mimeType } = await this.client.downloadFile(
        teamId,
        imageUrl,
        file.mimetype,
      );
      const base64 = buffer.toString('base64');
      const scan: PendingScanData = {
        userId,
        accountId,
        slackUserId: userState.slackUserId,
        slackTeamId: teamId,
        channel,
        language,
        base64,
        mimeType: mimeType || 'image/jpeg',
      };
      // Slack keeps the original upload (a phone photo is often 2-4 MB): when it
      // cannot be a part, its thumbnail can. The scan itself still reads the original.
      const fitsAsPart = canBePart(scan.base64, scan.mimeType);

      // A receipt confirmation with room for another part is pending for this
      // user in this channel: the image may be its next part, so ask instead of
      // scanning (no timers).
      const pendingId = await this.livePendingReceiptId(userState);
      // Always fetched for an over-cap image, even a lone one with nothing pending:
      // it becomes part 1, so a second photo sent in a SEPARATE message can continue it.
      if (!fitsAsPart) {
        const part = await this.thumbnailPart(file, teamId);
        if (part) scan.part = part;
      }
      if (pendingId) {
        if (fitsAsPart || scan.part) {
          await this.askContinuation(pendingId, scan);
        } else {
          // Never silently start a second receipt beside the pending one: the user
          // saves or cancels it first, or sends a smaller image.
          await this.client.sendText(teamId, channel, t('receiptPartTooLarge', language));
        }
        return;
      }
      await this.scanOrWarn(scan);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleImage error for ${userState.channel}: ${error}`);
      await this.client.sendText(userState.slackTeamId, userState.channel, t('receiptScanFailed', userState.language));
    }
  }

  async handleDocument(file: SlackFile, userState: SlackUserState): Promise<void> {
    const { userId, accountId, channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      if (userState.accountRole === 'viewer') {
        await this.client.sendText(teamId, channel, t('viewerRestricted', language));
        return;
      }

      // Only accept image/* and application/pdf
      const mimeType = file.mimetype;
      if (!mimeType?.startsWith('image/') && mimeType !== 'application/pdf') {
        await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
        return;
      }

      const docUrl = file.url_private_download;
      if (!docUrl) {
        this.logger.warn(`Document file ${file.id} has no url_private_download`);
        await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
        return;
      }

      const { buffer } = await this.client.downloadFile(
        teamId,
        docUrl,
        file.mimetype,
      );
      const base64 = buffer.toString('base64');

      await this.scanOrWarn({
        userId,
        accountId,
        slackUserId: userState.slackUserId,
        slackTeamId: teamId,
        channel,
        language,
        base64,
        mimeType,
      });
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDocument error for ${userState.channel}: ${error}`);
      await this.client.sendText(userState.slackTeamId, userState.channel, t('receiptScanFailed', userState.language));
    }
  }

  /**
   * Stage 1 of the duplicate warning (ABA-603): before any AI request is spent,
   * ask whether this exact file was already scanned and saved. On a match the
   * scan is parked in Redis and the user chooses; otherwise it runs straight on.
   */
  private async scanOrWarn(scan: PendingScanData): Promise<void> {
    const { slackTeamId: teamId, channel, language, accountId, base64 } = scan;
    const duplicate =
      (await this.receiptDuplicates?.findByFingerprint(accountId, receiptFingerprint(base64))) ?? null;
    if (!duplicate) {
      await this.runScan(scan);
      return;
    }
    const scanId = randomUUID().slice(0, 8);
    await this.redis.set(`slack:dupscan:${scanId}`, JSON.stringify(scan), 'EX', 1800);
    await this.client.sendButtons(
      teamId,
      channel,
      t('receiptDuplicateExact', language, { what: describeDuplicate(duplicate) }),
      [
        { id: `receipt_rescan:${scanId}`, title: t('scanAnyway', language) },
        { id: `receipt_rescan_x:${scanId}`, title: t('cancel', language) },
      ],
    );
  }

  async handleRescanCallback(scanId: string, userState: SlackUserState): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      const raw = await this.redis.get(`slack:dupscan:${scanId}`);
      if (!raw) {
        await this.client.sendText(teamId, channel, t('scanRequestExpired', language));
        return;
      }
      await this.redis.del(`slack:dupscan:${scanId}`);
      const scan: PendingScanData = JSON.parse(raw);
      await this.runScan(scan);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleRescanCallback error for ${channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
    }
  }

  async handleRescanCancelCallback(scanId: string, userState: SlackUserState): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      await this.redis.del(`slack:dupscan:${scanId}`);
      await this.client.sendText(teamId, channel, t('receiptCancelled', language));
    } catch (error) {
      this.logger.error(`PhotoHandler.handleRescanCancelCallback error for ${channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('somethingWrong', language));
    }
  }

  /** OCR + preview, shared by images, documents and "Scan anyway". */
  private async runScan(scan: PendingScanData): Promise<void> {
    const { userId, accountId, slackTeamId: teamId, channel, language, base64, mimeType } = scan;
    let ts: string | undefined;
    try {
      // Track AI usage before OCR — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'ocr', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.client.sendText(teamId, channel, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      // Post placeholder before OCR — the slow part
      ts = await this.client.postPlaceholder(teamId, channel, t('thinking', language));

      const receipt =
        mimeType === 'application/pdf'
          ? await this.ocrService.parseReceiptPdf(base64, userId, accountId)
          : await this.ocrService.parseReceipt(base64, userId, accountId);

      if (!receipt || receipt.amount <= 0) {
        await this.client.replyText(teamId, channel, ts, t('receiptScanFailed', language));
        return;
      }

      const shortId = randomUUID().slice(0, 8);
      const data: PendingReceiptData = {
        userId,
        accountId,
        amount: receipt.amount,
        currencyCode: receipt.currencyCode,
        description: receipt.description,
        categoryId: receipt.categoryId,
        date: receipt.date,
        discountAmount: receipt.discountAmount,
        depositAmount: receipt.depositAmount,
        merchant: receipt.merchant,
        location: receipt.location,
        categorySplits: receipt.categorySplits ?? [],
        items: receipt.receiptItems || [],
        // Part 1 is what a continuation reads: the original when it can be a part,
        // else its thumbnail (the original is then kept for a single-photo save).
        parts: [scan.part ?? { imageBase64: base64, mimeType }],
        originalImage: scan.part ? { imageBase64: base64, mimeType } : undefined,
        receiptMimeType: mimeType,
        cardTs: ts,
        receiptFingerprint: receipt.fingerprint,
        scanAttestation: receipt.scanAttestation,
        mergeCandidate: receiptMergeCandidate(receipt.possibleDuplicate),
        language,
      };
      await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

      const cardTs = await this.client.replyButtons(
        teamId,
        channel,
        ts,
        this.buildCardSummary(receipt, language),
        this.cardButtons(shortId, language),
      );
      if (cardTs && cardTs !== ts) {
        // No placeholder: the card was posted as a new message.
        await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify({ ...data, cardTs }), 'EX', 1800);
      }

      // The pointer that makes this user's next image in this channel ask
      // "continuation?". Only an image the parts reader accepts, within the part
      // cap, can be part 1 — never a PDF.
      // (A scan parked before the user id was recorded sets none.)
      if (scan.slackUserId && (scan.part || canBePart(base64, mimeType))) {
        await this.cache.set(this.pointerKey(channel, scan.slackUserId), shortId, PENDING_RECEIPT_TTL_SEC);
      }
    } catch (error) {
      this.logger.error(`PhotoHandler.runScan error for ${channel}: ${error}`);
      await this.client.replyText(teamId, channel, ts, t('receiptScanFailed', language));
    }
  }

  private buildCardSummary(receipt: ReceiptExpense, language: string): string {
    let summary = this.buildSummaryText(receipt.amount, receipt.currencyCode, receipt.date, receipt.merchant, language);
    const priceCheckLine = this.buildPriceCheckLine(receipt, language);
    if (priceCheckLine) {
      summary += `\n${priceCheckLine}`;
    }
    const categorySplitLine = buildCategorySplitLine(receipt.categorySplits ?? [], receipt.currencyCode, language);
    if (categorySplitLine) {
      summary += `\n${categorySplitLine}`;
    }
    // Stage 2 (ABA-603): the same receipt in a different file, found by what it says.
    const duplicateLine = buildDuplicateLine(t, receipt.possibleDuplicate, language);
    if (duplicateLine) {
      summary += `\n${duplicateLine}`;
    }
    return summary;
  }

  private cardButtons(shortId: string, language: string) {
    return [
      { id: `receipt_add:${shortId}`, title: t('addExpense', language) },
      { id: `receipt_items:${shortId}`, title: t('editItems', language) },
      { id: `receipt_date:${shortId}`, title: t('changeDate', language) },
      { id: `receipt_cancel:${shortId}`, title: t('cancel', language) },
    ];
  }

  // ── Long receipt in several photos ─────────────────────────────────────────

  /** Pointer to this user's pending receipt in this channel. */
  private pointerKey(channel: string, slackUserId: string): string {
    return pendingPointerKey('slack', channel, slackUserId);
  }

  /** The receipt this user's next image in this channel may continue, if still pending with room. */
  private async livePendingReceiptId(userState: SlackUserState): Promise<string | null> {
    const shortId = await this.cache.get<string>(this.pointerKey(userState.channel, userState.slackUserId));
    if (!shortId) return null;
    const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(shortId));
    if (!data || data.userId !== userState.userId) return null;
    // Already at the part limit: the image can only be a new receipt.
    if ((data.parts?.length ?? 0) >= MAX_BOT_PARTS) return null;
    return shortId;
  }

  /**
   * Parks the image and asks "continuation or new receipt?". An image arriving
   * while an earlier question is unanswered gets its own question and parked
   * copy; continuations join the receipt in the order they are answered.
   */
  private async askContinuation(shortId: string, scan: PendingScanData): Promise<void> {
    const tmpId = randomUUID().slice(0, 8);
    await this.cache.set<PendingScanData>(questionScanKey(tmpId), scan, PENDING_RECEIPT_TTL_SEC);
    const { slackTeamId, channel, language } = scan;
    const questionTs = await this.client.sendButtons(slackTeamId, channel, t('receiptContinuationQuestion', language), [
      { id: `receipt_part:${shortId}:${tmpId}`, title: t('receiptContinuationYes', language) },
      { id: `receipt_new:${tmpId}`, title: t('receiptContinuationNo', language) },
    ]);
    if (questionTs) {
      await this.cache.set<PendingScanData>(questionScanKey(tmpId), { ...scan, questionTs }, PENDING_RECEIPT_TTL_SEC);
    }
  }

  /** The parked image, only for the user who sent it (anyone in a channel can tap). Not consumed. */
  private async peekQuestionScan(tmpId: string, userState: SlackUserState): Promise<PendingScanData | null> {
    const scan = await this.cache.get<PendingScanData>(questionScanKey(tmpId));
    if (!scan) {
      await this.client.sendText(userState.slackTeamId, userState.channel, t('scanRequestExpired', userState.language));
      return null;
    }
    if (scan.userId !== userState.userId) return null;
    return scan;
  }

  /** Runs `work` under the receipt's busy lock; tells the user to wait when another action holds it. */
  private async lockReceipt(shortId: string, userState: SlackUserState, work: () => Promise<void>): Promise<void> {
    const ran = await withReceiptLock(this.cache, receiptBusyKey(shortId), work);
    if (!ran) {
      await this.client.sendText(userState.slackTeamId, userState.channel, t('receiptBusy', userState.language));
    }
  }

  /** "New receipt": the parked image is scanned alone, exactly like a fresh one. */
  async handleNewReceiptCallback(tmpId: string, userState: SlackUserState): Promise<void> {
    try {
      const scan = await this.peekQuestionScan(tmpId, userState);
      if (!scan) return;
      await this.cache.del(questionScanKey(tmpId));
      await this.scanOrWarn(scan);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleNewReceiptCallback error for ${userState.channel}: ${error}`);
      await this.client.sendText(userState.slackTeamId, userState.channel, t('receiptScanFailed', userState.language));
    }
  }

  /**
   * "Continuation": the parked image becomes the receipt's next part and ONE
   * model call re-reads all parts (see `continueReceiptWithPart` for billing,
   * refunds and the re-read before every write). Holds the receipt's busy lock,
   * so a save, a cancel or a second continuation tapped meanwhile is told to wait.
   */
  async handlePartCallback(shortId: string, tmpId: string, userState: SlackUserState): Promise<void> {
    const { slackTeamId: teamId, channel, language } = userState;
    try {
      const scan = await this.peekQuestionScan(tmpId, userState);
      if (!scan) return;
      await this.lockReceipt(shortId, userState, async () => {
        try {
          await this.continueReceipt(shortId, tmpId, scan);
        } catch (error) {
          this.logger.error(`PhotoHandler.continueReceipt error for ${channel}: ${error}`);
          await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
        }
      });
    } catch (error) {
      this.logger.error(`PhotoHandler.handlePartCallback error for ${channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('somethingWrong', language));
    }
  }

  private async continueReceipt(shortId: string, tmpId: string, scan: PendingScanData): Promise<void> {
    const { slackTeamId: teamId, channel, language } = scan;
    const slackUserId = scan.slackUserId!;
    const result = await continueReceiptWithPart<PendingReceiptData>(
      { cache: this.cache, subscriptions: this.subscriptionsService, ocr: this.ocrService },
      {
        receiptKey: pendingReceiptKey(shortId),
        part: scan.part ?? { imageBase64: scan.base64, mimeType: scan.mimeType },
        userId: scan.userId,
        accountId: scan.accountId,
        ttlSec: PENDING_RECEIPT_TTL_SEC,
        // Charged: the image is now consumed.
        onCharged: async () => {
          await this.cache.del(questionScanKey(tmpId));
          // The tap must visibly do something: the question loses its buttons at once,
          // and the read below can take up to a minute.
          if (scan.questionTs) {
            await this.client
              .updateText(teamId, channel, scan.questionTs, t('receiptPartsReading', language))
              .catch(() => undefined);
          }
        },
        // The window for the next part runs from this part on.
        onAppended: () => this.cache.set(this.pointerKey(channel, slackUserId), shortId, PENDING_RECEIPT_TTL_SEC),
        apply: (current, receipt) => ({ ...current, ...this.receiptFields(receipt) }),
      },
    );

    if (result.status === 'limit') {
      // The parked image stays: "New receipt" or a later retry can still use it.
      await this.client.sendText(teamId, channel, t('aiLimitReached', language));
      return;
    }
    if (result.status === 'refused') {
      const { key, params } = partRefusalMessage(result.reason);
      await this.client.sendText(teamId, channel, t(key, language, params));
      return;
    }
    // Saved, cancelled or expired meanwhile: the card is no longer ours to touch.
    if (result.status === 'superseded') return;

    // The card is replaced, so a correction typed against the old lines or an
    // armed date prompt must not apply to the new ones.
    await this.cache.del(`slack:awaiting_item_edit:${slackUserId}`, `slack:awaiting_date:${slackUserId}`);
    await this.replaceCard(teamId, channel, shortId, result.data, this.buildCardSummary(result.receipt, language));
    // The "reading…" note in place of the question has done its job.
    if (scan.questionTs) {
      await this.client.deleteMessage(teamId, channel, scan.questionTs).catch(() => undefined);
    }
  }

  /**
   * Posts the updated card at the bottom of the channel and deletes the old one.
   * Not an in-place update: the old card sits above the continuation question and
   * the image, so an update there looked to the user like nothing happened.
   */
  private async replaceCard(
    teamId: string,
    channel: string,
    shortId: string,
    data: PendingReceiptData,
    summary: string,
  ): Promise<void> {
    const buttons = this.cardButtons(shortId, data.language);
    if (data.cardTs) {
      await this.client.deleteMessage(teamId, channel, data.cardTs).catch((e) => {
        this.logger.warn(`old receipt card delete failed: ${e}`);
      });
    }
    const ts = await this.client.sendButtons(teamId, channel, summary, buttons);
    // The newest card is the one a later continuation updates. Under the lock, so
    // a fresh read is the current receipt.
    if (ts) {
      const current = await this.cache.get<PendingReceiptData>(pendingReceiptKey(shortId));
      if (current) await this.cache.set(pendingReceiptKey(shortId), { ...current, cardTs: ts }, PENDING_RECEIPT_TTL_SEC);
    }
  }

  /**
   * The largest Slack thumbnail that can be a receipt part, or null. Downloaded
   * with the bot token from the same host as the file (the helper refuses others).
   */
  private async thumbnailPart(file: SlackFile, teamId: string): Promise<ReceiptImagePart | null> {
    for (const url of [file.thumb_1024, file.thumb_720]) {
      if (!url) continue;
      try {
        const { buffer } = await this.client.downloadFile(teamId, url, file.mimetype);
        const mimeType = sniffImageMime(buffer) ?? file.mimetype;
        const imageBase64 = buffer.toString('base64');
        if (canBePart(imageBase64, mimeType)) return { imageBase64, mimeType };
      } catch (e) {
        this.logger.warn(`thumbnail download failed for ${file.id}: ${e}`);
      }
    }
    return null;
  }

  /** The scan result as stored on the pending receipt (replaced wholesale by a continuation). */
  private receiptFields(receipt: ReceiptExpense) {
    return {
      amount: receipt.amount,
      currencyCode: receipt.currencyCode,
      description: receipt.description,
      categoryId: receipt.categoryId,
      date: receipt.date,
      discountAmount: receipt.discountAmount,
      depositAmount: receipt.depositAmount,
      merchant: receipt.merchant,
      location: receipt.location,
      categorySplits: receipt.categorySplits ?? [],
      items: receipt.receiptItems || [],
      receiptFingerprint: receipt.fingerprint,
      scanAttestation: receipt.scanAttestation,
      mergeCandidate: receiptMergeCandidate(receipt.possibleDuplicate),
    };
  }

  /** Ends the "continuation?" window when this receipt is saved or cancelled. */
  private async clearPointer(userState: SlackUserState, shortId: string): Promise<void> {
    const key = this.pointerKey(userState.channel, userState.slackUserId);
    if ((await this.cache.get<string>(key)) === shortId) await this.cache.del(key);
  }

  /** Returns true if the text was consumed by the "awaiting date" mode. */
  async handleDateInput(text: string, userState: SlackUserState): Promise<boolean> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      const shortId = await this.redis.get(`slack:awaiting_date:${userState.slackUserId}`);
      if (!shortId) return false;

      // Parse DD.MM.YYYY (also accept - and / separators)
      const match = text.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
      if (!match) {
        await this.client.sendText(teamId, channel, t('invalidDate', language));
        // Do NOT clear the awaiting-date key — let the user retry
        return true;
      }

      const [, day, month, year] = match;
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        await this.client.sendText(teamId, channel, t('invalidDate', language));
        // Do NOT clear the awaiting-date key — let the user retry
        return true;
      }

      // Read-modify-write the receipt JSON in Redis, under the receipt's busy lock:
      // a continuation re-reading the parts meanwhile would otherwise be overwritten
      // by this stale copy (and lose a paid part).
      await this.lockReceipt(shortId, userState, async () => {
        const raw = await this.redis.get(`slack:receipt:${shortId}`);
        if (!raw) {
          // Receipt expired — clear the awaiting-date state and return
          await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);
          await this.client.sendText(teamId, channel, `${t('cancelled', language)} Expired.`);
          return;
        }

        const data: PendingReceiptData = JSON.parse(raw);
        data.date = dateStr;
        await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);
        await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);

        const formattedDate = `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
        await this.client.sendText(teamId, channel, t('dateUpdated', language, { date: formattedDate }));

        // Re-send the card with updated receipt info; it becomes the card a
        // continuation updates.
        const summary = this.buildSummaryText(data.amount, data.currencyCode, dateStr, data.merchant, language);
        const cardTs = await this.client.sendButtons(teamId, channel, summary, this.cardButtons(shortId, language));
        if (cardTs) {
          await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify({ ...data, cardTs }), 'EX', 1800);
        }
      });

      return true;
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDateInput error for ${userState.channel}: ${error}`);
      return false;
    }
  }

  /** Save, under the receipt's busy lock: never mid-way through a continuation's read. */
  async handleReceiptAddCallback(shortId: string, userState: SlackUserState, mode?: 'merge' | 'keep'): Promise<void> {
    try {
      await this.lockReceipt(shortId, userState, () => this.saveReceipt(shortId, userState, mode));
    } catch (error) {
      this.logger.error(`PhotoHandler.handleReceiptAddCallback error for ${userState.channel}: ${error}`);
      await this.client.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }

  private async saveReceipt(shortId: string, userState: SlackUserState, mode?: 'merge' | 'keep'): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      const raw = await this.redis.get(`slack:receipt:${shortId}`);
      if (!raw) {
        await this.client.sendText(teamId, channel, `${t('cancelled', language)} Expired.`);
        return;
      }

      const data: PendingReceiptData = JSON.parse(raw);
      // A matching expense the user entered or the bank captured: ask before
      // saving whether to fold it into this receipt (ABA-744).
      if (data.mergeCandidate && !mode) {
        await this.client.sendButtons(teamId, channel, t('receiptMergeQuestion', language, { what: data.mergeCandidate.what }), [
          { id: `receipt_merge:${shortId}`, title: t('receiptMergeYes', language) },
          { id: `receipt_keep:${shortId}`, title: t('receiptKeepBoth', language) },
          { id: `receipt_cancel:${shortId}`, title: t('cancel', language) },
        ]);
        return;
      }
      const resolvedSplits = await resolveProposedSplits(
        data.categorySplits ?? [],
        (name) => this.categoriesService.create(data.accountId, data.userId, { name, type: 'expense', icon: '🏷️' }),
      );
      const itemCategoryIds = buildItemCategoryMap(resolvedSplits);
      const parts: ReceiptImagePart[] =
        data.parts ??
        (data.receiptImageBase64 ? [{ imageBase64: data.receiptImageBase64, mimeType: data.receiptMimeType }] : []);
      // A single photo saves the original upload, exactly as before; a multi-part
      // receipt saves the parts it read (part 1 may then be the thumbnail).
      const image = parts.length <= 1 && data.originalImage ? data.originalImage : parts[0];

      const { expense } = await this.expensesService.create(data.accountId, data.userId, {
        localId: randomUUID(),
        amount: data.amount,
        discountAmount: data.discountAmount || undefined,
        depositAmount: data.depositAmount || undefined,
        currencyCode: data.currencyCode,
        description: data.description,
        merchant: data.merchant ?? undefined,
        categoryId: data.categoryId || undefined,
        date: data.date ? `${data.date}T12:00:00.000Z` : new Date().toISOString(),
        source: 'ocr',
        location: data.location ?? undefined,
        splits: resolvedSplits.length ? resolvedSplits : undefined,
        // Part 1 is the receipt image every reader shows; parts 2..N travel beside it.
        receiptImageBase64: image?.imageBase64,
        receiptImageParts: parts.length > 1 ? parts.slice(1) : undefined,
        receiptMimeType: image?.mimeType ?? data.receiptMimeType,
        receiptFingerprint: data.receiptFingerprint,
        scanAttestation: data.scanAttestation,
        // The user chose to fold the matching expense into this receipt (ABA-744).
        mergeWithExpenseId: mode === 'merge' ? data.mergeCandidate?.id : undefined,
        items: data.items.map((item, index) => ({
          description: item.description,
          canonicalName: item.canonicalName,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || item.totalPrice,
          totalPrice: item.totalPrice,
          sortOrder: index,
          categoryId: itemCategoryIds.get(index) ?? item.categoryId ?? undefined,
        })),
      });

      await this.redis.del(`slack:receipt:${shortId}`);
      await this.clearPointer(userState, shortId);
      await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);
      // Leave item-edit mode, or the next chat message would be swallowed by the
      // correction parser instead of reaching the AI.
      await this.redis.del(`slack:awaiting_item_edit:${userState.slackUserId}`);

      // Auto-check-off matching shopping-list items (ABA bot-receipt-shopping-list-reconciliation).
      // Awaited so its count can ride the SAME confirmation message, but its own
      // failure must never be reported as an expense-creation failure — the
      // expense was already created successfully by this point.
      const reconciled = await this.shoppingListService
        .reconcileWithReceipt(data.accountId, data.items)
        .catch((e) => {
          this.logger.warn(`shoppingListService.reconcileWithReceipt failed: ${e}`);
          return { checkedLabels: [] as string[] };
        });
      const shoppingLine = buildShoppingListReconciliationLine(reconciled.checkedLabels, language);

      const amountStr = `${data.amount} ${data.currencyCode}`;
      await this.client.sendText(
        teamId,
        channel,
        `${t('expenseCreated', language)}: *${amountStr}* — ${data.description}` +
          (shoppingLine ? `\n${shoppingLine}` : '') +
          (mode === 'merge' && data.mergeCandidate
            ? `\n${t('receiptMergedNote', language, { what: data.mergeCandidate.what })}`
            : ''),
      );

      // Makes this write undoable via chat's "undo" (ABA-599) — a receipt-confirm
      // button never touches ChatActionLifecycleService.confirmAction. Fire-and-forget:
      // must never affect the reply already sent above. Guarded on `expense` truthy —
      // defensive only, ExpensesService.create() always resolves one.
      if (expense) {
        const currentConversationId = userState.conversationId;
        void this.chatActionRecorder
          .recordExternalWrite({
            userId: data.userId,
            accountId: data.accountId,
            conversationId: currentConversationId,
            actionType: 'create_expense',
            resultData: {
              id: expense.id,
              amount: Number(expense.amount),
              currencyCode: expense.currencyCode,
              description: expense.description,
              category: (expense as any)?.category?.name,
              date: expense.date,
            },
          })
          .then((newConversationId) => {
            if (newConversationId !== currentConversationId) {
              return this.linkService.updateConversationId(userState.slackUserId, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'PhotoHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`PhotoHandler.handleReceiptAddCallback error for ${userState.channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('somethingWrong', language));
    }
  }

  async handleDateCallback(shortId: string, userState: SlackUserState): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      const raw = await this.redis.get(`slack:receipt:${shortId}`);
      if (!raw) {
        await this.client.sendText(teamId, channel, `${t('cancelled', language)} Expired.`);
        return;
      }

      await this.redis.set(`slack:awaiting_date:${userState.slackUserId}`, shortId, 'EX', 600);
      await this.client.sendText(teamId, channel, t('sendDate', language));
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDateCallback error for ${userState.channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('somethingWrong', language));
    }
  }

  /** Step into line-item edit mode. Corrections are typed — see receipt-item-edit.ts. */
  async handleItemsCallback(shortId: string, userState: SlackUserState): Promise<void> {
    const { slackTeamId: teamId, channel, language, slackUserId } = userState;
    try {
      // Under the receipt's busy lock: this read-modify-write must not overwrite a
      // continuation's result (and drop a paid part) with a stale copy.
      await this.lockReceipt(shortId, userState, async () => {
        const raw = await this.redis.get(`slack:receipt:${shortId}`);
        if (!raw) {
          await this.client.sendText(teamId, channel, `${t('cancelled', language)} Expired.`);
          return;
        }

        const data: PendingReceiptData = JSON.parse(raw);
        // Land the split's item -> category mapping on the items once, so deleting a
        // line cannot shift it (the split carries positions, not per-item ids).
        data.items = seedItemGroups(data.items, data.categorySplits ?? []);
        await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

        // The two typed-input modes are mutually exclusive.
        await this.redis.del(`slack:awaiting_date:${slackUserId}`);
        await this.redis.set(`slack:awaiting_item_edit:${slackUserId}`, shortId, 'EX', 600);

        await this.client.sendText(teamId, channel, t('itemEditHint', language));
        await this.sendItemEditView(shortId, data, userState);
      });
    } catch (error) {
      this.logger.error(`PhotoHandler.handleItemsCallback error for ${channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('somethingWrong', language));
    }
  }

  /** Returns true if the text was consumed by the "editing items" mode. */
  async handleItemEditInput(text: string, userState: SlackUserState): Promise<boolean> {
    const { slackTeamId: teamId, channel, language, slackUserId } = userState;
    try {
      const shortId = await this.redis.get(`slack:awaiting_item_edit:${slackUserId}`);
      if (!shortId) return false;

      const raw = await this.redis.get(`slack:receipt:${shortId}`);
      if (!raw) {
        await this.redis.del(`slack:awaiting_item_edit:${slackUserId}`);
        return false;
      }

      const command = parseItemEditCommand(text);
      if (!command) {
        await this.client.sendText(
          teamId,
          channel,
          `${t('itemEditInvalid', language)}\n\n${t('itemEditHint', language)}`,
        );
        return true;
      }

      // Applied to a fresh read under the receipt's busy lock, so a continuation's
      // parts and totals are never overwritten by a stale copy.
      let consumed = true;
      await this.lockReceipt(shortId, userState, async () => {
        // The mode may have ended meanwhile (a continuation replaced the card).
        if ((await this.redis.get(`slack:awaiting_item_edit:${slackUserId}`)) !== shortId) {
          consumed = false;
          return;
        }
        const fresh = await this.redis.get(`slack:receipt:${shortId}`);
        if (!fresh) {
          consumed = false;
          return;
        }
        const data: PendingReceiptData = JSON.parse(fresh);
        const outcome = applyItemEditCommand(data.items, data.amount, command);
        if (!outcome.ok) {
          await this.client.sendText(
            teamId,
            channel,
            this.itemEditErrorText(outcome.error, command, language),
          );
          return;
        }

        data.items = outcome.items;
        data.amount = outcome.total;
        data.categorySplits = recomputeSplits({
          items: outcome.items,
          total: outcome.total,
          discount: data.discountAmount,
          deposit: data.depositAmount,
          existing: data.categorySplits ?? [],
        });
        await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

        await this.sendItemEditView(shortId, data, userState, t('itemsUpdated', language));
      });
      return consumed;
    } catch (error) {
      this.logger.error(`PhotoHandler.handleItemEditInput error for ${channel}: ${error}`);
      return false;
    }
  }

  private async sendItemEditView(
    shortId: string,
    data: PendingReceiptData,
    userState: SlackUserState,
    header?: string,
  ): Promise<void> {
    const { slackTeamId: teamId, channel, language } = userState;
    const block = buildItemListBlock(data.items, data.currencyCode, data.amount, language);
    const splitLine = buildCategorySplitLine(data.categorySplits ?? [], data.currencyCode, language);
    const body = [header, block, splitLine].filter(Boolean).join('\n\n');

    await this.client.sendButtons(teamId, channel, body, [
      { id: `receipt_add:${shortId}`, title: t('addExpense', language) },
      { id: `receipt_cancel:${shortId}`, title: t('cancel', language) },
    ]);
  }

  private itemEditErrorText(
    error: ItemEditError,
    command: ItemEditCommand,
    language: string | undefined,
  ): string {
    if (error === 'no_such_line') {
      const index = 'index' in command ? command.index : undefined;
      return t('itemEditNoSuchLine', language, { index: String(index ?? '') });
    }
    if (error === 'invalid_amount') return t('itemEditInvalidAmount', language);
    return t('itemEditEmptyDescription', language);
  }

  async handleReceiptCancelCallback(shortId: string, userState: SlackUserState): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      // Under the receipt's busy lock: a continuation's read cannot bring the card back.
      await this.lockReceipt(shortId, userState, async () => {
        await this.redis.del(`slack:receipt:${shortId}`);
        await this.clearPointer(userState, shortId);
        await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);
        // Leave item-edit mode, or the next chat message would be swallowed by the
        // correction parser instead of reaching the AI.
        await this.redis.del(`slack:awaiting_item_edit:${userState.slackUserId}`);
        await this.client.sendText(teamId, channel, t('receiptCancelled', language));
      });
    } catch (error) {
      this.logger.error(`PhotoHandler.handleReceiptCancelCallback error for ${userState.channel}: ${error}`);
      await this.client.sendText(teamId, channel, t('somethingWrong', language));
    }
  }

  private buildSummaryText(
    amount: number,
    currency: string,
    date: string | null,
    merchant: string | null | undefined,
    language: string,
  ): string {
    let summary = `${t('receiptScanned', language)}\n*Amount:* ${amount} ${currency}`;
    if (date) {
      summary += `\n*Date:* ${date}`;
    }
    if (merchant) {
      summary += `\n*Vendor:* ${merchant}`;
    }
    return summary;
  }

  /**
   * One summary line reporting price-check findings — lines that cost
   * measurably more than the user's usual price for that product in that
   * store. Never phrased as an accusation (no "overcharged"/"scammed"/
   * "promo not applied"); empty string when there is nothing to report so a
   * clean receipt reads exactly as it did before this feature existed.
   */
  private buildPriceCheckLine(receipt: ReceiptExpense, lang: string): string {
    const findings = receipt.priceFindings ?? [];
    if (findings.length === 0) return '';
    const total = findings.reduce((sum, f) => sum + f.overpaidAmount, 0);
    return t('priceCheckSummary', lang, {
      count: String(findings.length),
      amount: `${total.toFixed(2)} ${findings[0].currencyCode}`,
    });
  }
}
