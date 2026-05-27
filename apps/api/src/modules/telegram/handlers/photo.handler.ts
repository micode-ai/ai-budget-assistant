import { Logger, ForbiddenException } from '@nestjs/common';
import { Markup } from 'telegraf';
import { randomUUID } from 'crypto';
import { OcrService } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { BotContext } from '../types';
import { formatCurrency, escapeHtml } from '../helpers/format-telegram';
import { downloadFile } from '../helpers/download-file';
import { t } from '../helpers/i18n';

// `ctx.answerCbQuery` throws if Telegram considers the callback query expired
// (15s window). When called from a `catch` block, an unhandled rethrow would
// bubble out of the polling loop and silently kill the bot.
async function safeAnswerCb(ctx: BotContext, text?: string): Promise<void> {
  try {
    await ctx.answerCbQuery(text);
  } catch {}
}

// In-memory store for pending receipt data (keyed by callback ID)
// In production, consider Redis or DB storage for multi-instance deployments
const pendingReceipts = new Map<string, PendingReceiptData>();

interface PendingReceiptData {
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: string;
  description: string;
  merchant?: string;
  categoryId: string | null;
  date: string | null;
  discountAmount: number | null;
  items: Array<{ description: string; quantity?: number; unitPrice?: number; totalPrice: number }>;
  receiptImageBase64: string;
  receiptMimeType: string;
  createdAt: number;
  language?: string;
}

// Map telegramUserId → receiptId for date editing flow
const awaitingDateEdit = new Map<string, string>();

// Clean up old pending receipts (older than 30 minutes)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, data] of pendingReceipts) {
    if (data.createdAt < cutoff) {
      pendingReceipts.delete(key);
    }
  }
}, 5 * 60 * 1000);

export class PhotoHandler {
  private readonly logger = new Logger(PhotoHandler.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly expensesService: ExpensesService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async handlePhoto(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
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

      // Store pending receipt data
      pendingReceipts.set(receiptId, {
        userId: ctx.userState.userId,
        accountId: ctx.userState.accountId,
        amount: receipt.amount,
        currencyCode: receipt.currencyCode,
        description: receipt.description,
        merchant: receipt.merchant ?? undefined,
        categoryId: receipt.categoryId,
        date: receipt.date,
        discountAmount: receipt.discountAmount,
        receiptMimeType: 'image/jpeg',
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        createdAt: Date.now(),
        language: lang,
      });

      await ctx.reply(summary, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
          [
            Markup.button.callback(t('changeDate', lang), `receipt_date:${receiptId}`),
            Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`),
          ],
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

      pendingReceipts.set(receiptId, {
        userId: ctx.userState!.userId,
        accountId: ctx.userState!.accountId,
        amount: receipt.amount,
        currencyCode: receipt.currencyCode,
        description: receipt.description,
        merchant: receipt.merchant ?? undefined,
        categoryId: receipt.categoryId,
        date: receipt.date,
        discountAmount: receipt.discountAmount,
        receiptMimeType: mime_type || 'application/pdf',
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        createdAt: Date.now(),
        language: lang,
      });

      await ctx.reply(summary, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('addExpense', lang), `receipt_add:${receiptId}`)],
          [
            Markup.button.callback(t('changeDate', lang), `receipt_date:${receiptId}`),
            Markup.button.callback(t('cancel', lang), `receipt_cancel:${receiptId}`),
          ],
        ]),
      });
    } catch (error) {
      this.logger.error(`Error processing document: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply('❌ Could not scan the document. Please try again.');
    }
  }

  async handleReceiptAddCallback(ctx: BotContext, receiptId: string): Promise<void> {
    const data = pendingReceipts.get(receiptId);
    if (!data) {
      await safeAnswerCb(ctx, 'Receipt data expired. Please resend the photo.');
      return;
    }

    // Acknowledge the callback immediately; if Telegram says the query is too
    // old, we still want to create the expense the user explicitly confirmed.
    await safeAnswerCb(ctx, 'Creating expense...');

    try {
      await this.expensesService.create(
        data.accountId,
        data.userId,
        {
          localId: randomUUID(),
          amount: data.amount,
          discountAmount: data.discountAmount || undefined,
          currencyCode: data.currencyCode,
          description: data.description,
          merchant: data.merchant,
          categoryId: data.categoryId || undefined,
          date: data.date ? `${data.date}T12:00:00.000Z` : new Date().toISOString(),
          source: 'ocr',
          receiptMimeType: data.receiptMimeType,
          receiptImageBase64: data.receiptImageBase64,
          items: data.items.map((item, index) => ({
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || item.totalPrice,
            totalPrice: item.totalPrice,
            sortOrder: index,
          })),
        },
      );

      pendingReceipts.delete(receiptId);

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
      const data = pendingReceipts.get(receiptId);
      if (!data) {
        await ctx.answerCbQuery('Expired');
        return;
      }

      const telegramUserId = String(ctx.from!.id);
      awaitingDateEdit.set(telegramUserId, receiptId);
      await ctx.answerCbQuery('');
      await ctx.reply(t('sendDate', data.language), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in date callback: ${error}`);
    }
  }

  async handleDateInput(ctx: BotContext): Promise<boolean> {
    const telegramUserId = String(ctx.from!.id);
    const receiptId = awaitingDateEdit.get(telegramUserId);
    if (!receiptId) return false;

    const data = pendingReceipts.get(receiptId);
    if (!data) {
      awaitingDateEdit.delete(telegramUserId);
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
    awaitingDateEdit.delete(telegramUserId);

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

  async handleReceiptCancelCallback(ctx: BotContext, receiptId: string): Promise<void> {
    pendingReceipts.delete(receiptId);
    await ctx.answerCbQuery('Cancelled.');
    await ctx.editMessageText(t('receiptCancelled', ctx.userState?.language));
  }
}
