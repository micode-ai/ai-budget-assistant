import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { randomUUID } from 'crypto';
import { OcrService } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { BotContext } from '../types';
import { formatCurrency, escapeHtml } from '../helpers/format-telegram';
import { downloadFile } from '../helpers/download-file';

// In-memory store for pending receipt data (keyed by callback ID)
// In production, consider Redis or DB storage for multi-instance deployments
const pendingReceipts = new Map<string, PendingReceiptData>();

interface PendingReceiptData {
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  date: string | null;
  discountAmount: number | null;
  items: Array<{ description: string; quantity?: number; unitPrice?: number; totalPrice: number }>;
  receiptImageBase64: string;
  createdAt: number;
}

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
  ) {}

  async handlePhoto(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      if (!ctx.message || !('photo' in ctx.message) || !ctx.message.photo?.length) {
        await ctx.reply('Could not process the photo. Please try again.');
        return;
      }

      await ctx.sendChatAction('typing');

      // Get the highest resolution photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const buffer = await downloadFile(fileLink.href);
      const base64 = buffer.toString('base64');

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
      let summary = `📄 <b>Receipt scanned</b>\n\n`;
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
        categoryId: receipt.categoryId,
        date: receipt.date,
        discountAmount: receipt.discountAmount,
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        createdAt: Date.now(),
      });

      await ctx.reply(summary, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.callback('✅ Add expense', `receipt_add:${receiptId}`),
          Markup.button.callback('❌ Cancel', `receipt_cancel:${receiptId}`),
        ]),
      });
    } catch (error) {
      this.logger.error(`Error processing photo: ${error}`);
      await ctx.reply('❌ Could not scan the receipt. Please try again or add the expense manually.');
    }
  }

  async handleDocument(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
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
      const buffer = await downloadFile(fileLink.href);
      const base64 = buffer.toString('base64');

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
      let summary = `📄 <b>Receipt scanned</b>\n\n`;
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
        userId: ctx.userState.userId,
        accountId: ctx.userState.accountId,
        amount: receipt.amount,
        currencyCode: receipt.currencyCode,
        description: receipt.description,
        categoryId: receipt.categoryId,
        date: receipt.date,
        discountAmount: receipt.discountAmount,
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        createdAt: Date.now(),
      });

      await ctx.reply(summary, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.callback('✅ Add expense', `receipt_add:${receiptId}`),
          Markup.button.callback('❌ Cancel', `receipt_cancel:${receiptId}`),
        ]),
      });
    } catch (error) {
      this.logger.error(`Error processing document: ${error}`);
      await ctx.reply('❌ Could not scan the document. Please try again.');
    }
  }

  async handleReceiptAddCallback(ctx: BotContext, receiptId: string): Promise<void> {
    try {
      const data = pendingReceipts.get(receiptId);
      if (!data) {
        await ctx.answerCbQuery('Receipt data expired. Please resend the photo.');
        return;
      }

      await ctx.answerCbQuery('Creating expense...');

      const { expense } = await this.expensesService.create(
        data.accountId,
        data.userId,
        {
          localId: randomUUID(),
          amount: data.amount,
          discountAmount: data.discountAmount || undefined,
          currencyCode: data.currencyCode,
          description: data.description,
          categoryId: data.categoryId || undefined,
          date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
          source: 'ocr',
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

      await ctx.editMessageText(
        `✅ Expense created: <b>${formatCurrency(data.amount, data.currencyCode)}</b> — ${escapeHtml(data.description)}`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error creating receipt expense: ${error}`);
      await ctx.answerCbQuery('Failed to create expense.');
    }
  }

  async handleReceiptCancelCallback(ctx: BotContext, receiptId: string): Promise<void> {
    pendingReceipts.delete(receiptId);
    await ctx.answerCbQuery('Cancelled.');
    await ctx.editMessageText('❌ Receipt scan cancelled.');
  }
}
