import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Markup } from 'telegraf';
import { randomUUID } from 'crypto';
import { OcrService } from '../../ai/services/ocr.service';
import type { ReceiptExpense } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { CategoriesService } from '../../categories/categories.service';
import { CacheService } from '../../../common/cache/cache.service';
import { BotContext } from '../types';
import { formatCurrency, escapeHtml } from '../helpers/format-telegram';
import { downloadFile } from '../helpers/download-file';
import { t, buildCategorySplitLine, buildItemListBlock } from '../helpers/i18n';
import {
  parseItemEditCommand,
  applyItemEditCommand,
  recomputeSplits,
  seedItemGroups,
  type ItemEditCommand,
  type ItemEditError,
} from '../../../common/utils/receipt-item-edit';
import { buildItemCategoryMap, resolveProposedSplits } from '../../ai/utils/receipt-split-items';

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
  receiptImageBase64: string;
  receiptMimeType: string;
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
    private readonly cache: CacheService,
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

      // Get the highest resolution photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      this.logger.log(`[Photo] file_id: ${photo.file_id}, file_size: ${photo.file_size || 'unknown'}, ${photo.width}x${photo.height}`);

      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      this.logger.log(`[Photo] Download URL: ${fileLink.href.substring(0, 80)}...`);

      const buffer = await downloadFile(fileLink.href);
      this.logger.log(`[Photo] Downloaded ${(buffer.length / 1024).toFixed(1)}KB`);

      const base64 = buffer.toString('base64');

      // Track AI usage for OCR (2.0)
      try {
        await this.subscriptionsService.trackAiUsage(ctx.userState.userId, 'ocr', 2.0, ctx.userState.accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await ctx.reply(t('aiLimitReached', ctx.userState?.language));
          return;
        }
        throw e;
      }

      // Get caption as optional user prompt
      const caption = ('caption' in ctx.message) ? ctx.message.caption : undefined;

      // Parse receipt using OCR service
      const receipt = await this.ocrService.parseReceipt(
        base64,
        ctx.userState.userId,
        ctx.userState.accountId,
        caption || undefined,
      );

      // Build summary message
      const receiptId = randomUUID().slice(0, 8);
      const lang = ctx.userState?.language;
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

      // Store pending receipt data
      await this.cache.set<PendingReceiptData>(
        pendingReceiptKey(receiptId),
        {
          userId: ctx.userState.userId,
          accountId: ctx.userState.accountId,
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
          receiptMimeType: 'image/jpeg',
          items: receipt.receiptItems || [],
          receiptImageBase64: base64,
          language: lang,
        },
        PENDING_RECEIPT_TTL_SEC,
      );

      await ctx.reply(summary, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
          [
            Markup.button.callback(t('editItems', lang), `receipt_items:${receiptId}`),
            Markup.button.callback(t('changeDate', lang), `receipt_date:${receiptId}`),
          ],
          [Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`)],
        ]),
      });
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

      // Track AI usage for OCR (2.0)
      try {
        await this.subscriptionsService.trackAiUsage(ctx.userState!.userId, 'ocr', 2.0, ctx.userState!.accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await ctx.reply(t('aiLimitReached', ctx.userState?.language));
          return;
        }
        throw e;
      }

      const caption = ('caption' in ctx.message) ? ctx.message.caption : undefined;

      let receipt;
      if (mime_type === 'application/pdf') {
        receipt = await this.ocrService.parseReceiptPdf(
          base64,
          ctx.userState.userId,
          ctx.userState.accountId,
          caption || undefined,
        );
      } else {
        receipt = await this.ocrService.parseReceipt(
          base64,
          ctx.userState.userId,
          ctx.userState.accountId,
          caption || undefined,
        );
      }

      // Build summary
      const receiptId = randomUUID().slice(0, 8);
      const lang = ctx.userState?.language;
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
      const priceCheckLine = this.buildPriceCheckLine(receipt, lang);
      if (priceCheckLine) {
        summary += `\n${priceCheckLine}\n`;
      }
      const categorySplitLine = buildCategorySplitLine(receipt.categorySplits ?? [], receipt.currencyCode, lang);
      if (categorySplitLine) {
        summary += `\n${escapeHtml(categorySplitLine)}\n`;
      }

      await this.cache.set<PendingReceiptData>(
        pendingReceiptKey(receiptId),
        {
          userId: ctx.userState!.userId,
          accountId: ctx.userState!.accountId,
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
          receiptMimeType: mime_type || 'application/pdf',
          items: receipt.receiptItems || [],
          receiptImageBase64: base64,
          language: lang,
        },
        PENDING_RECEIPT_TTL_SEC,
      );

      await ctx.reply(summary, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
          [
            Markup.button.callback(t('editItems', lang), `receipt_items:${receiptId}`),
            Markup.button.callback(t('changeDate', lang), `receipt_date:${receiptId}`),
          ],
          [Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`)],
        ]),
      });
    } catch (error) {
      this.logger.error(`Error processing document: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply('❌ Could not scan the document. Please try again.');
    }
  }

  async handleReceiptAddCallback(ctx: BotContext, receiptId: string): Promise<void> {
    const data = await this.cache.get<PendingReceiptData>(pendingReceiptKey(receiptId));
    if (!data) {
      await safeAnswerCb(ctx, 'Receipt data expired. Please resend the photo.');
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
      await this.expensesService.create(
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
          receiptImageBase64: data.receiptImageBase64,
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
      // Leave item-edit mode, or the user's next chat message would be swallowed
      // by the correction parser instead of reaching the AI.
      await this.cache.del(awaitingItemEditKey(String(ctx.from!.id)));

      try {
        await ctx.editMessageText(
          `✅ Expense created: <b>${formatCurrency(data.amount, data.currencyCode)}</b> — ${escapeHtml(data.description)}`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        // editMessageText can fail (message too old, deleted, etc.) — expense
        // is already created, fall back to a plain reply.
        this.logger.warn(`editMessageText failed after expense create: ${e}`);
        try {
          await ctx.reply(
            `✅ Expense created: <b>${formatCurrency(data.amount, data.currencyCode)}</b> — ${escapeHtml(data.description)}`,
            { parse_mode: 'HTML' },
          );
        } catch {}
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

    data.date = dateStr;
    await this.cache.set<PendingReceiptData>(pendingReceiptKey(receiptId), data, PENDING_RECEIPT_TTL_SEC);
    await this.cache.del(awaitingDateKey(telegramUserId));

    // Re-show the receipt summary with updated date and action buttons
    const lang = data.language;
    const formattedDate = `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
    let summary = `${t('dateUpdated', lang, { date: formattedDate })}\n\n`;
    summary += `<b>Amount:</b> ${formatCurrency(data.amount, data.currencyCode)}\n`;
    if (data.discountAmount) {
      summary += `<b>Discount:</b> ${formatCurrency(data.discountAmount, data.currencyCode)}\n`;
    }
    if (data.description) {
      summary += `<b>Description:</b> ${escapeHtml(data.description)}\n`;
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

    const outcome = applyItemEditCommand(data.items, data.amount, command);
    if (!outcome.ok) {
      await ctx.reply(this.itemEditErrorText(outcome.error, command, data.language), {
        parse_mode: 'HTML',
      });
      return true;
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
    return true;
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

  async handleReceiptCancelCallback(ctx: BotContext, receiptId: string): Promise<void> {
    await this.cache.del(pendingReceiptKey(receiptId));
    await this.cache.del(awaitingItemEditKey(String(ctx.from!.id)));
    await ctx.answerCbQuery('Cancelled.');
    await ctx.editMessageText(t('receiptCancelled', ctx.userState?.language));
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
