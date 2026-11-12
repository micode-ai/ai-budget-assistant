import { Injectable, Logger, ForbiddenException, Optional } from '@nestjs/common';
import { Markup } from 'telegraf';
import { randomUUID } from 'crypto';
import { OcrService } from '../../ai/services/ocr.service';
import type { ReceiptExpense } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { ReceiptDuplicateService, receiptFingerprint, receiptMergeCandidate } from '../../expenses/receipt-duplicate.service';
import { buildDuplicateLine, describeDuplicate } from '../../../common/bot-i18n/shared-messages';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { CategoriesService } from '../../categories/categories.service';
import { ShoppingListService } from '../../shopping-list/shopping-list.service';
import { CacheService } from '../../../common/cache/cache.service';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { TelegramLinkService } from '../telegram-link.service';
import { BotContext } from '../types';
import { formatCurrency, escapeHtml } from '../helpers/format-telegram';
import { downloadFile } from '../helpers/download-file';
import { t, buildCategorySplitLine, buildItemListBlock, buildShoppingListReconciliationLine } from '../helpers/i18n';
import {
  parseItemEditCommand,
  applyItemEditCommand,
  recomputeSplits,
  seedItemGroups,
  type ItemEditCommand,
  type ItemEditError,
} from '../../../common/utils/receipt-item-edit';
import { buildItemCategoryMap, resolveProposedSplits } from '../../ai/utils/receipt-split-items';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import type { ReceiptImagePart } from '@budget/shared-types';
import {
  MAX_BOT_PARTS,
  MAX_BOT_PART_BYTES,
  OCR_COST_PER_PART,
  canBePart,
  continueReceiptWithPart,
  partRefusalMessage,
  pendingPointerKey,
  withReceiptLock,
} from '../../../common/bot-receipt-parts';

// `ctx.answerCbQuery` throws if Telegram considers the callback query expired
// (15s window). When called from a `catch` block, an unhandled rethrow would
// bubble out of the polling loop and silently kill the bot.
async function safeAnswerCb(ctx: BotContext, text?: string): Promise<void> {
  try {
    await ctx.answerCbQuery(text);
  } catch {}
}

// Pending receipt data + the date-edit cursor live in Redis (mirroring the
// WhatsApp bot's `wa:receipt:*`/`wa:awaiting_date:*` keys), not module-level
// Maps — an in-memory Map is wiped on every deploy restart, silently
// orphaning any user mid-scan. Redis TTL replaces the old manual LRU sweep.
const PENDING_RECEIPT_TTL_SEC = 1800;
const AWAITING_DATE_TTL_SEC = 600;
const AWAITING_ITEM_EDIT_TTL_SEC = 600;
const pendingReceiptKey = (receiptId: string) => `telegram:receipt:${receiptId}`;
// A scan held back by the same-file duplicate warning (ABA-603), kept so
// "Scan anyway" needs no re-upload.
const PENDING_SCAN_TTL_SEC = 1800;
const pendingScanKey = (scanId: string) => `telegram:dupscan:${scanId}`;

interface PendingScanData {
  userId: string;
  accountId: string;
  base64: string;
  mimeType: string;
  caption?: string;
  language?: string;
}
// A photo held back by the "continuation or new receipt?" question (long receipt
// in several photos), so either answer needs no re-upload.
const questionScanKey = (tmpId: string) => `telegram:scan:${tmpId}`;
// Held while one action owns a pending receipt (a continuation's model call, a
// save, a cancel) so none of them overwrites another's result.
const receiptBusyKey = (receiptId: string) => `telegram:receipt-busy:${receiptId}`;

/**
 * The size Telegram offers that can become a PART of a long receipt: the largest
 * one within the part cap (Telegram downscales — the bot never resizes
 * server-side). A size with no `file_size` is taken as fitting; null when none
 * fits. A plain single photo does not use this: it scans from the largest size.
 */
function pickPartPhotoSize<T extends { file_size?: number }>(sizes: T[]): T | null {
  for (let i = sizes.length - 1; i >= 0; i--) {
    const size = sizes[i].file_size;
    if (size === undefined || size <= MAX_BOT_PART_BYTES) return sizes[i];
  }
  return null;
}

const awaitingDateKey = (telegramUserId: string) => `telegram:awaiting_date:${telegramUserId}`;
const awaitingItemEditKey = (telegramUserId: string) =>
  `telegram:awaiting_item_edit:${telegramUserId}`;

interface PendingReceiptData {
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: string;
  description: string;
  merchant?: string;
  location?: { lat: number; lng: number; name?: string } | null;
  categorySplits?: ReceiptExpense['categorySplits'];
  categoryId: string | null;
  date: string | null;
  discountAmount: number | null;
  depositAmount: number | null;
  items: Array<{
    description: string;
    /** Category the scan classified this line into; survives even when the
     * receipt produced no money split. */
    categoryId?: string | null;
    /** Set when the user steps into item-edit mode (`seedItemGroups`): the split's
     * own name, which is the only handle on a category the scan merely PROPOSED.
     * Redis-only — never read by the confirm path. */
    categoryName?: string | null;
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
  /** The scan's caption, handed to the re-read of all parts. */
  caption?: string;
  /** Where the confirm card is, so a continuation can replace it in place. */
  cardChatId?: number | string;
  cardMessageId?: number;
  /** Server-signed scan token (ABA-642), handed back on create; never edited. */
  scanAttestation?: string;
  /** A bank or user-entered row this receipt may be folded into on save (ABA-744). */
  mergeCandidate?: { id: string; what: string };
  language?: string;
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
    private readonly cache: CacheService,
    private readonly chatActionRecorder: ChatActionRecorderService,
    private readonly linkService: TelegramLinkService,
    @Optional() private readonly receiptDuplicates?: ReceiptDuplicateService,
  ) {}

  async handlePhoto(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
        return;
      }

      if (ctx.userState.accountRole === 'viewer') {
        await ctx.reply(t('viewerRestricted', ctx.userState.language));
        return;
      }

      if (!ctx.message || !('photo' in ctx.message) || !ctx.message.photo?.length) {
        await ctx.reply('Could not process the photo. Please try again.');
        return;
      }

      await ctx.sendChatAction('typing');

      const caption = ('caption' in ctx.message) ? ctx.message.caption : undefined;
      const sizes = ctx.message.photo;

      // A receipt confirmation with room for another part is pending for this
      // user in this chat: the photo may be its next part, so ask instead of
      // scanning (no timers). Only a size within the part cap can be parked.
      const pendingId = await this.livePendingReceiptId(ctx, ctx.userState.userId);
      const partSize = pendingId ? pickPartPhotoSize(sizes) : null;
      // Otherwise the highest resolution, exactly as a single photo always scanned.
      const photo = partSize ?? sizes[sizes.length - 1];
      this.logger.log(`[Photo] file_id: ${photo.file_id}, file_size: ${photo.file_size || 'unknown'}, ${photo.width}x${photo.height}`);

      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      this.logger.log(`[Photo] Download URL: ${fileLink.href.substring(0, 80)}...`);

      const buffer = await downloadFile(fileLink.href);
      this.logger.log(`[Photo] Downloaded ${(buffer.length / 1024).toFixed(1)}KB`);

      const base64 = buffer.toString('base64');
      const scan = this.scanFromState(ctx, base64, 'image/jpeg', caption || undefined);

      if (pendingId && partSize && canBePart(base64, scan.mimeType)) {
        await this.askContinuation(ctx, pendingId, scan);
        return;
      }
      // No pending receipt, or this photo could never be a part: a new receipt.
      await this.scanOrWarn(ctx, scan);
    } catch (error) {
      this.logger.error(`Error processing photo: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply(t('receiptScanFailed', ctx.userState?.language));
    }
  }

  async handleDocument(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
        return;
      }

      if (ctx.userState.accountRole === 'viewer') {
        await ctx.reply(t('viewerRestricted', ctx.userState.language));
        return;
      }

      if (!ctx.message || !('document' in ctx.message) || !ctx.message.document) {
        return;
      }

      const { mime_type, file_id } = ctx.message.document;

      // Only process images and PDFs
      if (!mime_type?.startsWith('image/') && mime_type !== 'application/pdf') {
        return;
      }

      await ctx.sendChatAction('typing');

      const fileLink = await ctx.telegram.getFileLink(file_id);
      this.logger.log(`[Document] mime: ${mime_type}, Download URL: ${fileLink.href.substring(0, 80)}...`);

      const buffer = await downloadFile(fileLink.href);
      this.logger.log(`[Document] Downloaded ${(buffer.length / 1024).toFixed(1)}KB`);

      const base64 = buffer.toString('base64');

      const caption = ('caption' in ctx.message) ? ctx.message.caption : undefined;
      await this.scanOrWarn(ctx, this.scanFromState(ctx, base64, mime_type || 'application/pdf', caption || undefined));
    } catch (error) {
      this.logger.error(`Error processing document: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply('❌ Could not scan the document. Please try again.');
    }
  }

  private scanFromState(ctx: BotContext, base64: string, mimeType: string, caption?: string): PendingScanData {
    const state = ctx.userState!;
    return {
      userId: state.userId,
      accountId: state.accountId,
      base64,
      mimeType,
      caption,
      language: state.language,
    };
  }

  /**
   * Stage 1 of the duplicate warning (ABA-603): before any AI request is spent,
   * ask whether this exact file was already scanned and saved. On a match the
   * scan is parked in Redis and the user chooses; otherwise it runs straight on.
   */
  private async scanOrWarn(ctx: BotContext, scan: PendingScanData): Promise<void> {
    const state = ctx.userState!;
    const base64 = scan.base64;
    const duplicate =
      (await this.receiptDuplicates?.findByFingerprint(state.accountId, receiptFingerprint(base64))) ?? null;
    if (!duplicate) {
      await this.runScan(ctx, scan);
      return;
    }
    const scanId = randomUUID().slice(0, 8);
    await this.cache.set<PendingScanData>(pendingScanKey(scanId), scan, PENDING_SCAN_TTL_SEC);
    const lang = state.language;
    await ctx.reply(escapeHtml(t('receiptDuplicateExact', lang, { what: describeDuplicate(duplicate) })), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('scanAnyway', lang), `receipt_rescan:${scanId}`)],
        [Markup.button.callback(t('cancel', lang), `receipt_rescan_x:${scanId}`)],
      ]),
    });
  }

  async handleRescanCallback(ctx: BotContext, scanId: string): Promise<void> {
    const scan = await this.cache.get<PendingScanData>(pendingScanKey(scanId));
    if (!scan) {
      await safeAnswerCb(ctx, t('scanRequestExpired', ctx.userState?.language));
      return;
    }
    await this.cache.del(pendingScanKey(scanId));
    await safeAnswerCb(ctx);
    try {
      await ctx.sendChatAction('typing');
      await this.runScan(ctx, scan);
    } catch (error) {
      this.logger.error(`Error re-scanning receipt: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply(t('receiptScanFailed', scan.language));
    }
  }

  async handleRescanCancelCallback(ctx: BotContext, scanId: string): Promise<void> {
    await this.cache.del(pendingScanKey(scanId));
    await safeAnswerCb(ctx);
    await ctx.editMessageText(t('receiptCancelled', ctx.userState?.language));
  }

  /** OCR + preview, shared by photos, documents and "Scan anyway". */
  private async runScan(ctx: BotContext, scan: PendingScanData): Promise<void> {
    const lang = scan.language;
    // Track AI usage for OCR (2.0)
    try {
      await this.subscriptionsService.trackAiUsage(scan.userId, 'ocr', OCR_COST_PER_PART, scan.accountId);
    } catch (e) {
      if (e instanceof ForbiddenException) {
        await ctx.reply(t('aiLimitReached', lang));
        return;
      }
      throw e;
    }

    const receipt =
      scan.mimeType === 'application/pdf'
        ? await this.ocrService.parseReceiptPdf(scan.base64, scan.userId, scan.accountId, scan.caption)
        : await this.ocrService.parseReceipt(scan.base64, scan.userId, scan.accountId, scan.caption);

    const receiptId = randomUUID().slice(0, 8);
    const data: PendingReceiptData = {
      userId: scan.userId,
      accountId: scan.accountId,
      ...this.receiptFields(receipt),
      receiptMimeType: scan.mimeType,
      parts: [{ imageBase64: scan.base64, mimeType: scan.mimeType }],
      caption: scan.caption,
      language: lang,
    };
    await this.cache.set<PendingReceiptData>(pendingReceiptKey(receiptId), data, PENDING_RECEIPT_TTL_SEC);

    const sent = await ctx.reply(this.buildCardSummary(receipt, lang), this.cardMarkup(receiptId, lang));

    // Where the card is, so a continuation can replace it, and the pointer that
    // makes this user's next photo in this chat ask "continuation?". Only an
    // image the parts reader accepts, within the part cap, can be part 1 — never a PDF.
    const messageId = (sent as { message_id?: number } | undefined)?.message_id;
    if (messageId !== undefined) {
      data.cardChatId = ctx.chat?.id;
      data.cardMessageId = messageId;
      await this.cache.set<PendingReceiptData>(pendingReceiptKey(receiptId), data, PENDING_RECEIPT_TTL_SEC);
    }
    if (canBePart(scan.base64, scan.mimeType)) {
      await this.cache.set(this.pointerKey(ctx), receiptId, PENDING_RECEIPT_TTL_SEC);
    }
  }

  /** The scan result as stored on the pending receipt (replaced wholesale by a continuation). */
  private receiptFields(receipt: ReceiptExpense) {
    return {
      amount: receipt.amount,
      currencyCode: receipt.currencyCode,
      description: receipt.description,
      merchant: receipt.merchant ?? undefined,
      location: receipt.location,
      categorySplits: receipt.categorySplits ?? [],
      categoryId: receipt.categoryId,
      date: receipt.date,
      discountAmount: receipt.discountAmount,
      depositAmount: receipt.depositAmount,
      items: receipt.receiptItems || [],
      receiptFingerprint: receipt.fingerprint,
      scanAttestation: receipt.scanAttestation,
      mergeCandidate: receiptMergeCandidate(receipt.possibleDuplicate),
    };
  }

  private cardMarkup(receiptId: string, lang: string | undefined) {
    return {
      parse_mode: 'HTML' as const,
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
        [
          Markup.button.callback(t('editItems', lang), `receipt_items:${receiptId}`),
          Markup.button.callback(t('changeDate', lang), `receipt_date:${receiptId}`),
        ],
        [Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`)],
      ]),
    };
  }

  private buildCardSummary(receipt: ReceiptExpense, lang: string | undefined): string {
    let summary = `${t('receiptScanned', lang)}\n\n`;
    summary += `<b>Amount:</b> ${formatCurrency(receipt.amount, receipt.currencyCode)}\n`;
    if (receipt.discountAmount) {
      summary += `<b>Discount:</b> ${formatCurrency(receipt.discountAmount, receipt.currencyCode)}\n`;
    }
    if (receipt.merchant) {
      summary += `<b>Merchant:</b> ${escapeHtml(receipt.merchant)}\n`;
    }
    if (receipt.description) {
      summary += `<b>Description:</b> ${escapeHtml(receipt.description)}\n`;
    }
    if (receipt.categorySuggestion) {
      summary += `<b>Category:</b> ${escapeHtml(receipt.categorySuggestion)}\n`;
    }
    if (receipt.date) {
      summary += `<b>Date:</b> ${receipt.date}\n`;
    }
    if (receipt.receiptItems && receipt.receiptItems.length > 0 && receipt.receiptItems.length <= 10) {
      summary += `\n<b>Items:</b>\n`;
      for (const item of receipt.receiptItems) {
        const qty = item.quantity && item.quantity > 1 ? `${item.quantity}× ` : '';
        summary += `  • ${qty}${escapeHtml(item.description)} — ${formatCurrency(item.totalPrice, receipt.currencyCode)}\n`;
      }
    } else if (receipt.receiptItems && receipt.receiptItems.length > 10) {
      summary += `\n<i>${receipt.receiptItems.length} items found</i>\n`;
    }
    const priceCheckLine = this.buildPriceCheckLine(receipt, lang);
    if (priceCheckLine) {
      summary += `\n${priceCheckLine}\n`;
    }
    const categorySplitLine = buildCategorySplitLine(receipt.categorySplits ?? [], receipt.currencyCode, lang);
    if (categorySplitLine) {
      summary += `\n${escapeHtml(categorySplitLine)}\n`;
    }
    // Stage 2 (ABA-603): the same receipt in a different file, found by what it says.
    const duplicateLine = buildDuplicateLine(t, receipt.possibleDuplicate, lang);
    if (duplicateLine) {
      summary += `\n${escapeHtml(duplicateLine)}\n`;
    }
    return summary;
  }

  // ── Long receipt in several photos ─────────────────────────────────────────

  /** Pointer to this user's pending receipt in this chat (private chat id = user id). */
  private pointerKey(ctx: BotContext): string {
    const fromId = String(ctx.from!.id);
    return pendingPointerKey('telegram', String(ctx.chat?.id ?? fromId), fromId);
  }

  /** The receipt this user's next photo in this chat may continue, if it is still pending. */
  private async livePendingReceiptId(ctx: BotContext, userId: string): Promise<string | null> {
    const receiptId = await this.cache.get<string>(this.pointerKey(ctx));
    if (!receiptId) return null;
    const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
    if (!data || data.userId !== userId) return null;
    // Already at the part limit: the photo can only be a new receipt.
    if ((data.parts?.length ?? 0) >= MAX_BOT_PARTS) return null;
    return receiptId;
  }

  /**
   * Parks the photo and asks "continuation or new receipt?". A photo that comes
   * while an earlier question is unanswered (an album arrives as separate
   * updates) gets its own question and its own parked copy; continuations join
   * the receipt in the order they are answered.
   */
  private async askContinuation(ctx: BotContext, receiptId: string, scan: PendingScanData): Promise<void> {
    const tmpId = randomUUID().slice(0, 8);
    await this.cache.set<PendingScanData>(questionScanKey(tmpId), scan, PENDING_RECEIPT_TTL_SEC);
    const lang = scan.language;
    await ctx.reply(t('receiptContinuationQuestion', lang), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('receiptContinuationYes', lang), `receipt_part:${receiptId}:${tmpId}`)],
        [Markup.button.callback(t('receiptContinuationNo', lang), `receipt_new:${tmpId}`)],
      ]),
    });
  }

  /** The parked photo, only for the user who sent it (in a group anyone can tap). Not consumed. */
  private async peekQuestionScan(ctx: BotContext, tmpId: string): Promise<PendingScanData | null> {
    const scan = await this.cache.get<PendingScanData>(questionScanKey(tmpId));
    if (!scan) {
      await safeAnswerCb(ctx, t('scanRequestExpired', ctx.userState?.language));
      return null;
    }
    if (!ctx.userState || ctx.userState.userId !== scan.userId) {
      await safeAnswerCb(ctx);
      return null;
    }
    return scan;
  }

  /**
   * Runs `work` holding the receipt's busy lock; answers "please wait" and runs
   * nothing when another action holds it. Returns false when refused.
   * `setIfAbsent` is false on a Redis outage too — refusing is the safe side.
   */
  private async withReceiptLock(
    ctx: BotContext,
    receiptId: string,
    lang: string | undefined,
    work: () => Promise<void>,
  ): Promise<boolean> {
    const ran = await withReceiptLock(this.cache, receiptBusyKey(receiptId), work);
    if (!ran) await safeAnswerCb(ctx, t('receiptBusy', lang));
    return ran;
  }

  /** "New receipt": the parked photo is scanned alone, exactly like a fresh photo. */
  async handleNewReceiptCallback(ctx: BotContext, tmpId: string): Promise<void> {
    const scan = await this.peekQuestionScan(ctx, tmpId);
    if (!scan) return;
    await this.cache.del(questionScanKey(tmpId));
    await safeAnswerCb(ctx);
    try {
      await ctx.sendChatAction('typing');
      await this.scanOrWarn(ctx, scan);
    } catch (error) {
      this.logger.error(`Error scanning new receipt: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply(t('receiptScanFailed', scan.language));
    }
  }

  /**
   * "Continuation": the parked photo becomes the receipt's next part, and ONE
   * model call re-reads all parts; the result replaces the pending receipt
   * (items, totals, fingerprint, attestation) and its card. Billed like the API
   * at 2.0 per part: the added part costs one more 2.0, refunded whenever the
   * part is refused (full, too large, receipt gone, rejected by the reader).
   *
   * The whole continuation holds the receipt's busy lock: a second continuation,
   * a save or a cancel tapped meanwhile is told to wait, so nothing overwrites
   * another action's result. The receipt is re-read before every write anyway
   * (it may also expire), and nothing is written to a receipt that is gone.
   */
  async handlePartCallback(ctx: BotContext, receiptId: string, tmpId: string): Promise<void> {
    const scan = await this.peekQuestionScan(ctx, tmpId);
    if (!scan) return;
    const lang = scan.language;
    await this.withReceiptLock(ctx, receiptId, lang, async () => {
      try {
        await this.continueReceipt(ctx, receiptId, tmpId, scan);
      } catch (error) {
        this.logger.error(`Error reading receipt parts: ${error}`, error instanceof Error ? error.stack : undefined);
        await ctx.reply(t('receiptScanFailed', lang));
      }
    });
  }

  private async continueReceipt(ctx: BotContext, receiptId: string, tmpId: string, scan: PendingScanData): Promise<void> {
    const lang = scan.language;
    const result = await continueReceiptWithPart<PendingReceiptData>(
      { cache: this.cache, subscriptions: this.subscriptionsService, ocr: this.ocrService },
      {
        receiptKey: pendingReceiptKey(receiptId),
        part: { imageBase64: scan.base64, mimeType: scan.mimeType },
        userId: scan.userId,
        accountId: scan.accountId,
        ttlSec: PENDING_RECEIPT_TTL_SEC,
        // Charged: the photo is now consumed.
        onCharged: async () => {
          await this.cache.del(questionScanKey(tmpId));
          await safeAnswerCb(ctx);
        },
        onAppended: async () => {
          // The window for the next part runs from this part on.
          await this.cache.set(this.pointerKey(ctx), receiptId, PENDING_RECEIPT_TTL_SEC);
          await ctx.sendChatAction('typing');
        },
        apply: (current, receipt) => ({ ...current, ...this.receiptFields(receipt) }),
      },
    );

    if (result.status === 'limit') {
      // The parked photo stays: "New receipt" or a later retry can still use it.
      await safeAnswerCb(ctx);
      await ctx.reply(t('aiLimitReached', lang));
      return;
    }
    if (result.status === 'refused') {
      const { key, params } = partRefusalMessage(result.reason);
      await ctx.reply(t(key, lang, params));
      return;
    }
    // Saved, cancelled or expired meanwhile: the card is no longer ours to touch.
    if (result.status === 'superseded') return;

    // The card is replaced, so a correction typed against the old lines or an
    // armed date prompt must not apply to the new ones.
    const telegramUserId = String(ctx.from!.id);
    await this.cache.del(awaitingItemEditKey(telegramUserId), awaitingDateKey(telegramUserId));

    await this.replaceCard(ctx, receiptId, result.data, this.buildCardSummary(result.receipt, result.data.language));
  }

  /** Edits the confirm card in place; re-sends it when Telegram refuses the edit. */
  private async replaceCard(ctx: BotContext, receiptId: string, data: PendingReceiptData, summary: string): Promise<void> {
    const markup = this.cardMarkup(receiptId, data.language);
    if (data.cardChatId !== undefined && data.cardMessageId !== undefined) {
      try {
        await ctx.telegram.editMessageText(data.cardChatId, data.cardMessageId, undefined, summary, markup);
        return;
      } catch (e) {
        // The card already shows exactly this: re-sending would only duplicate it.
        if (/message is not modified/i.test(String((e as Error)?.message ?? e))) return;
        this.logger.warn(`receipt card edit failed, re-sending: ${e}`);
      }
    }
    const sent = await ctx.reply(summary, markup);
    const messageId = (sent as { message_id?: number } | undefined)?.message_id;
    if (messageId !== undefined) {
      await this.cache.set<PendingReceiptData>(
        pendingReceiptKey(receiptId),
        { ...data, cardChatId: ctx.chat?.id, cardMessageId: messageId },
        PENDING_RECEIPT_TTL_SEC,
      );
    }
  }

  /** Ends the "continuation?" window when this receipt is saved or cancelled. */
  private async clearPointer(ctx: BotContext, receiptId: string): Promise<void> {
    if (!ctx.from) return;
    const key = this.pointerKey(ctx);
    if ((await this.cache.get<string>(key)) === receiptId) await this.cache.del(key);
  }

  /** Save, under the receipt's busy lock: never mid-way through a continuation's read. */
  async handleReceiptAddCallback(ctx: BotContext, receiptId: string, mode?: 'merge' | 'keep'): Promise<void> {
    await this.withReceiptLock(ctx, receiptId, ctx.userState?.language, () =>
      this.saveReceipt(ctx, receiptId, mode),
    );
  }

  private async saveReceipt(ctx: BotContext, receiptId: string, mode?: 'merge' | 'keep'): Promise<void> {
    const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
    if (!data) {
      await safeAnswerCb(ctx, 'Receipt data expired. Please resend the photo.');
      return;
    }

    // A matching expense the user entered or the bank captured: ask before
    // saving whether to fold it into this receipt (ABA-744).
    if (data.mergeCandidate && !mode) {
      await safeAnswerCb(ctx);
      await ctx.reply(escapeHtml(t('receiptMergeQuestion', data.language, { what: data.mergeCandidate.what })), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('receiptMergeYes', data.language), `receipt_merge:${receiptId}`)],
          [Markup.button.callback(t('receiptKeepBoth', data.language), `receipt_keep:${receiptId}`)],
          [Markup.button.callback(t('cancel', data.language), `receipt_cancel:${receiptId}`)],
        ]),
      });
      return;
    }

    // Acknowledge the callback immediately; if Telegram says the query is too
    // old, we still want to create the expense the user explicitly confirmed.
    await safeAnswerCb(ctx, 'Creating expense...');

    try {
      const resolvedSplits = await resolveProposedSplits(
        data.categorySplits ?? [],
        (name) => this.categoriesService.create(data.accountId, data.userId, { name, type: 'expense', icon: '🏷️' }),
      );
      const itemCategoryIds = buildItemCategoryMap(resolvedSplits);
      const parts: ReceiptImagePart[] =
        data.parts ??
        (data.receiptImageBase64 ? [{ imageBase64: data.receiptImageBase64, mimeType: data.receiptMimeType }] : []);
      const { expense } = await this.expensesService.create(
        data.accountId,
        data.userId,
        {
          localId: randomUUID(),
          amount: data.amount,
          discountAmount: data.discountAmount || undefined,
          depositAmount: data.depositAmount || undefined,
          currencyCode: data.currencyCode,
          description: data.description,
          merchant: data.merchant,
          categoryId: data.categoryId || undefined,
          date: data.date ? `${data.date}T12:00:00.000Z` : new Date().toISOString(),
          source: 'ocr',
          location: data.location ?? undefined,
          splits: resolvedSplits.length ? resolvedSplits : undefined,
          receiptMimeType: data.receiptMimeType,
          // Part 1 is the receipt image every reader shows; parts 2..N travel beside it.
          receiptImageBase64: parts[0]?.imageBase64,
          receiptImageParts: parts.length > 1 ? parts.slice(1) : undefined,
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
        },
      );

      await this.cache.del(pendingReceiptKey(receiptId));
      await this.clearPointer(ctx, receiptId);
      // Leave item-edit and date-edit modes, or the user's next chat message would
      // be swallowed by a correction parser instead of reaching the AI.
      await this.cache.del(awaitingItemEditKey(String(ctx.from!.id)), awaitingDateKey(String(ctx.from!.id)));

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
      const shoppingLine = buildShoppingListReconciliationLine(reconciled.checkedLabels, data.language);
      const confirmationText =
        `✅ Expense created: <b>${formatCurrency(data.amount, data.currencyCode)}</b> — ${escapeHtml(data.description)}` +
        (shoppingLine ? `\n${escapeHtml(shoppingLine)}` : '') +
        (mode === 'merge' && data.mergeCandidate
          ? `\n${escapeHtml(t('receiptMergedNote', data.language, { what: data.mergeCandidate.what }))}`
          : '');

      try {
        await ctx.editMessageText(confirmationText, { parse_mode: 'HTML' });
      } catch (e) {
        // editMessageText can fail (message too old, deleted, etc.) — expense
        // is already created, fall back to a plain reply.
        this.logger.warn(`editMessageText failed after expense create: ${e}`);
        try {
          await ctx.reply(confirmationText, { parse_mode: 'HTML' });
        } catch {}
      }

      // Makes this write undoable via chat's "undo" (ABA-599) — a receipt-confirm
      // callback never touches ChatActionLifecycleService.confirmAction. Uses
      // data.userId/data.accountId (how this handler already resolves the user)
      // rather than ctx.userState, which may be stale or absent by the time the
      // callback fires. Fire-and-forget: must never affect the reply already sent.
      // Guarded on `expense` truthy — defensive only, ExpensesService.create()
      // always resolves one.
      if (expense) {
        const currentConversationId = ctx.userState?.conversationId ?? null;
        const telegramUserId = String(ctx.from!.id);
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
              return this.linkService.updateConversationId(telegramUserId, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'PhotoHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`Error creating receipt expense: ${error}`);
      await safeAnswerCb(ctx, 'Failed to create expense.');
    }
  }

  async handleDateCallback(ctx: BotContext, receiptId: string): Promise<void> {
    try {
      const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
      if (!data) {
        await ctx.answerCbQuery('Expired');
        return;
      }

      const telegramUserId = String(ctx.from!.id);
      await this.cache.set(awaitingDateKey(telegramUserId), receiptId, AWAITING_DATE_TTL_SEC);
      await ctx.answerCbQuery('');
      await ctx.reply(t('sendDate', data.language), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in date callback: ${error}`);
    }
  }

  async handleDateInput(ctx: BotContext): Promise<boolean> {
    const telegramUserId = String(ctx.from!.id);
    const receiptId = await this.cache.get<string>(awaitingDateKey(telegramUserId));
    if (!receiptId) return false;

    const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
    if (!data) {
      await this.cache.del(awaitingDateKey(telegramUserId));
      return false;
    }

    const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text?.trim() : '';
    if (!text) return false;

    // Parse DD.MM.YYYY
    const match = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!match) {
      await ctx.reply(t('invalidDate', data.language));
      return true;
    }

    const [, day, month, year] = match;
    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      await ctx.reply(t('invalidDate', data.language));
      return true;
    }

    // Written onto a fresh read under the receipt's busy lock: a continuation
    // re-reading the parts meanwhile would otherwise be overwritten by a stale copy.
    const box: { data?: PendingReceiptData } = {};
    const ran = await withReceiptLock(this.cache, receiptBusyKey(receiptId), async () => {
      const fresh = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
      if (!fresh) return;
      fresh.date = dateStr;
      await this.cache.set<PendingReceiptData>(pendingReceiptKey(receiptId), fresh, PENDING_RECEIPT_TTL_SEC);
      box.data = fresh;
    });
    if (!ran) {
      await ctx.reply(t('receiptBusy', data.language));
      return true;
    }
    await this.cache.del(awaitingDateKey(telegramUserId));
    if (!box.data) return false;
    const updated = box.data;

    // Re-show the receipt summary with updated date and action buttons
    const lang = updated.language;
    const formattedDate = `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
    let summary = `${t('dateUpdated', lang, { date: formattedDate })}\n\n`;
    summary += `<b>Amount:</b> ${formatCurrency(updated.amount, updated.currencyCode)}\n`;
    if (updated.discountAmount) {
      summary += `<b>Discount:</b> ${formatCurrency(updated.discountAmount, updated.currencyCode)}\n`;
    }
    if (updated.description) {
      summary += `<b>Description:</b> ${escapeHtml(updated.description)}\n`;
    }
    summary += `<b>Date:</b> ${formattedDate}\n`;

    await ctx.reply(summary, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
        [Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`)],
      ]),
    });
    return true;
  }

  /**
   * Step into line-item edit mode. Corrections are typed rather than tapped: a
   * receipt has twenty to forty lines and WhatsApp caps interactive messages at 3
   * buttons / 10 rows, so one typed grammar is the only shape that works on all
   * three bots (see common/utils/receipt-item-edit.ts).
   */
  async handleItemsCallback(ctx: BotContext, receiptId: string): Promise<void> {
    try {
      // Under the receipt's busy lock: this read-modify-write must not overwrite a
      // continuation's result (and drop a paid part) with a stale copy.
      await this.withReceiptLock(ctx, receiptId, ctx.userState?.language, async () => {
        const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
        if (!data) {
          await safeAnswerCb(ctx, 'Expired');
          return;
        }

        const telegramUserId = String(ctx.from!.id);
        // The two typed-input modes are mutually exclusive — leaving a date prompt
        // armed would make the next message ambiguous.
        await this.cache.del(awaitingDateKey(telegramUserId));
        await this.cache.set(awaitingItemEditKey(telegramUserId), receiptId, AWAITING_ITEM_EDIT_TTL_SEC);
        await safeAnswerCb(ctx, '');

        // Land the split's item -> category mapping on the items once, so deleting a
        // line cannot shift it (the split carries positions, not per-item ids).
        data.items = seedItemGroups(data.items, data.categorySplits ?? []);
        await this.cache.set<PendingReceiptData>(
          pendingReceiptKey(receiptId),
          data,
          PENDING_RECEIPT_TTL_SEC,
        );

        await ctx.reply(t('itemEditHint', data.language), { parse_mode: 'HTML' });
        await this.sendItemEditView(ctx, receiptId, data);
      });
    } catch (error) {
      this.logger.error(`Error in items callback: ${error}`);
    }
  }

  /**
   * Consumes one typed correction. Returns false when this user is not editing a
   * receipt, so the bot's text router can pass the message on to the AI chat.
   */
  async handleItemEditInput(ctx: BotContext): Promise<boolean> {
    const telegramUserId = String(ctx.from!.id);
    const receiptId = await this.cache.get<string>(awaitingItemEditKey(telegramUserId));
    if (!receiptId) return false;

    const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
    if (!data) {
      await this.cache.del(awaitingItemEditKey(telegramUserId));
      return false;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text?.trim() : '';
    if (!text) return false;

    const command = parseItemEditCommand(text);
    if (!command) {
      await ctx.reply(`${t('itemEditInvalid', data.language)}\n\n${t('itemEditHint', data.language)}`, {
        parse_mode: 'HTML',
      });
      return true;
    }

    // Applied to a fresh read under the receipt's busy lock, so a continuation's
    // parts and totals are never overwritten by a stale copy.
    let consumed = true;
    const ran = await withReceiptLock(this.cache, receiptBusyKey(receiptId), async () => {
      // The mode may have ended meanwhile (a continuation replaced the card).
      const fresh = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
      if (!fresh || (await this.cache.get<string>(awaitingItemEditKey(telegramUserId))) !== receiptId) {
        consumed = false;
        return;
      }
      const data = fresh;
      const outcome = applyItemEditCommand(data.items, data.amount, command);
      if (!outcome.ok) {
        await ctx.reply(this.itemEditErrorText(outcome.error, command, data.language), {
          parse_mode: 'HTML',
        });
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
      await this.cache.set<PendingReceiptData>(pendingReceiptKey(receiptId), data, PENDING_RECEIPT_TTL_SEC);

      await this.sendItemEditView(ctx, receiptId, data, t('itemsUpdated', data.language));
    });
    if (!ran) await ctx.reply(t('receiptBusy', data.language));
    return consumed;
  }

  /** The numbered list plus the confirm/cancel keyboard, re-sent after every edit. */
  private async sendItemEditView(
    ctx: BotContext,
    receiptId: string,
    data: PendingReceiptData,
    header?: string,
  ): Promise<void> {
    const lang = data.language;
    // Item descriptions come from OCR and can contain `&` or `<`, which would
    // break parse_mode HTML — escaped exactly as the split line already is.
    const block = escapeHtml(buildItemListBlock(data.items, data.currencyCode, data.amount, lang));
    const splitLine = buildCategorySplitLine(data.categorySplits ?? [], data.currencyCode, lang);
    const body = [header, block, splitLine ? escapeHtml(splitLine) : '']
      .filter(Boolean)
      .join('\n\n');

    await ctx.reply(body, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
        [Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`)],
      ]),
    });
  }

  private itemEditErrorText(
    error: ItemEditError,
    command: ItemEditCommand,
    lang: string | undefined,
  ): string {
    if (error === 'no_such_line') {
      const index = 'index' in command ? command.index : undefined;
      return t('itemEditNoSuchLine', lang, { index: String(index ?? '') });
    }
    if (error === 'invalid_amount') return t('itemEditInvalidAmount', lang);
    return t('itemEditEmptyDescription', lang);
  }

  /** Cancel, under the receipt's busy lock: a continuation's read cannot bring the card back. */
  async handleReceiptCancelCallback(ctx: BotContext, receiptId: string): Promise<void> {
    await this.withReceiptLock(ctx, receiptId, ctx.userState?.language, async () => {
      const telegramUserId = String(ctx.from!.id);
      await this.cache.del(pendingReceiptKey(receiptId));
      await this.cache.del(awaitingItemEditKey(telegramUserId), awaitingDateKey(telegramUserId));
      await this.clearPointer(ctx, receiptId);
      await ctx.answerCbQuery('Cancelled.');
      await ctx.editMessageText(t('receiptCancelled', ctx.userState?.language));
    });
  }

  /**
   * One summary line reporting price-check findings — lines that cost
   * measurably more than the user's usual price for that product in that
   * store. Never phrased as an accusation (no "overcharged"/"scammed"/
   * "promo not applied"); empty string when there is nothing to report so a
   * clean receipt reads exactly as it did before this feature existed.
   */
  private buildPriceCheckLine(receipt: ReceiptExpense, lang: string | undefined): string {
    const findings = receipt.priceFindings ?? [];
    if (findings.length === 0) return '';
    const total = findings.reduce((sum, f) => sum + f.overpaidAmount, 0);
    return t('priceCheckSummary', lang, {
      count: String(findings.length),
      amount: `${total.toFixed(2)} ${findings[0].currencyCode}`,
    });
  }
}
