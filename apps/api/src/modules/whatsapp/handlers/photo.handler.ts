import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { OcrService } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WA_REDIS, WaMediaMessage, WhatsAppUserState } from '../types';
import { t } from '../helpers/i18n';

interface PendingReceiptData {
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  date: string | null;
  discountAmount: number | null;
  merchant: string | null;
  items: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice: number;
  }>;
  receiptImageBase64: string;
  receiptMimeType: string;
  language: string;
}

@Injectable()
export class PhotoHandler {
  private readonly logger = new Logger(PhotoHandler.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly expensesService: ExpensesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly client: WhatsAppClientService,
    @Inject(WA_REDIS) private readonly redis: Redis,
  ) {}

  async handleImage(msg: WaMediaMessage, userState: WhatsAppUserState): Promise<void> {
    const { userId, accountId, waPhoneNumber, language } = userState;
    try {
      const media = msg.image;
      if (!media) {
        this.logger.warn(`PhotoHandler.handleImage: no image in message ${msg.id}`);
        return;
      }

      // Track AI usage before downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'ocr', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.client.sendText(waPhoneNumber, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      const { buffer, mimeType } = await this.client.downloadMedia(media.id);
      const base64 = buffer.toString('base64');

      const receipt = await this.ocrService.parseReceipt(base64, userId, accountId);

      if (!receipt || receipt.amount <= 0) {
        await this.client.sendText(waPhoneNumber, t('receiptScanFailed', language));
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
        merchant: receipt.merchant,
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        receiptMimeType: mimeType || 'image/jpeg',
        language,
      };
      await this.redis.set(`wa:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

      const summary = this.buildSummaryText(receipt.amount, receipt.currencyCode, receipt.date, receipt.merchant, language);
      await this.client.sendButtons(waPhoneNumber, summary, [
        { id: `receipt_add--${shortId}`, title: t('addExpense', language) },
        { id: `receipt_date--${shortId}`, title: t('changeDate', language) },
        { id: `receipt_cancel--${shortId}`, title: t('cancel', language) },
      ]);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleImage error for ${userState.waPhoneNumber}: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('receiptScanFailed', userState.language));
    }
  }

  async handleDocument(msg: WaMediaMessage, userState: WhatsAppUserState): Promise<void> {
    const { userId, accountId, waPhoneNumber, language } = userState;
    try {
      const media = msg.document;
      if (!media) {
        this.logger.warn(`PhotoHandler.handleDocument: no document in message ${msg.id}`);
        return;
      }

      // Only accept image/* and application/pdf
      const mimeType = media.mime_type;
      if (!mimeType?.startsWith('image/') && mimeType !== 'application/pdf') {
        await this.client.sendText(waPhoneNumber, t('receiptScanFailed', language));
        return;
      }

      // Track AI usage before downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'ocr', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.client.sendText(waPhoneNumber, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      const { buffer } = await this.client.downloadMedia(media.id);
      const base64 = buffer.toString('base64');

      let receipt;
      if (mimeType === 'application/pdf') {
        receipt = await this.ocrService.parseReceiptPdf(base64, userId, accountId);
      } else {
        receipt = await this.ocrService.parseReceipt(base64, userId, accountId);
      }

      if (!receipt || receipt.amount <= 0) {
        await this.client.sendText(waPhoneNumber, t('receiptScanFailed', language));
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
        merchant: receipt.merchant,
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        receiptMimeType: mimeType,
        language,
      };
      await this.redis.set(`wa:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

      const summary = this.buildSummaryText(receipt.amount, receipt.currencyCode, receipt.date, receipt.merchant, language);
      await this.client.sendButtons(waPhoneNumber, summary, [
        { id: `receipt_add--${shortId}`, title: t('addExpense', language) },
        { id: `receipt_date--${shortId}`, title: t('changeDate', language) },
        { id: `receipt_cancel--${shortId}`, title: t('cancel', language) },
      ]);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDocument error for ${userState.waPhoneNumber}: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('receiptScanFailed', userState.language));
    }
  }

  /** Returns true if the text was consumed by the "awaiting date" mode. */
  async handleDateInput(text: string, userState: WhatsAppUserState): Promise<boolean> {
    const { waPhoneNumber, language } = userState;
    try {
      const shortId = await this.redis.get(`wa:awaiting_date:${waPhoneNumber}`);
      if (!shortId) return false;

      // Parse DD.MM.YYYY (also accept - and / separators)
      const match = text.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
      if (!match) {
        await this.client.sendText(waPhoneNumber, t('invalidDate', language));
        // Do NOT clear the awaiting-date key — let the user retry
        return true;
      }

      const [, day, month, year] = match;
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        await this.client.sendText(waPhoneNumber, t('invalidDate', language));
        // Do NOT clear the awaiting-date key — let the user retry
        return true;
      }

      // Read-modify-write the receipt JSON in Redis
      const raw = await this.redis.get(`wa:receipt:${shortId}`);
      if (!raw) {
        // Receipt expired — clear the awaiting-date state and return
        await this.redis.del(`wa:awaiting_date:${waPhoneNumber}`);
        await this.client.sendText(waPhoneNumber, `${t('cancelled', language)} Expired.`);
        return true;
      }

      const data: PendingReceiptData = JSON.parse(raw);
      data.date = dateStr;
      await this.redis.set(`wa:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);
      await this.redis.del(`wa:awaiting_date:${waPhoneNumber}`);

      const formattedDate = `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
      await this.client.sendText(waPhoneNumber, t('dateUpdated', language, { date: formattedDate }));

      // Re-send the 3 buttons with updated receipt info
      const summary = this.buildSummaryText(data.amount, data.currencyCode, dateStr, data.merchant, language);
      await this.client.sendButtons(waPhoneNumber, summary, [
        { id: `receipt_add--${shortId}`, title: t('addExpense', language) },
        { id: `receipt_date--${shortId}`, title: t('changeDate', language) },
        { id: `receipt_cancel--${shortId}`, title: t('cancel', language) },
      ]);

      return true;
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDateInput error for ${userState.waPhoneNumber}: ${error}`);
      return false;
    }
  }

  async handleReceiptAddCallback(shortId: string, userState: WhatsAppUserState): Promise<void> {
    const { waPhoneNumber, language } = userState;
    try {
      const raw = await this.redis.get(`wa:receipt:${shortId}`);
      if (!raw) {
        await this.client.sendText(waPhoneNumber, `${t('cancelled', language)} Expired.`);
        return;
      }

      const data: PendingReceiptData = JSON.parse(raw);

      await this.expensesService.create(data.accountId, data.userId, {
        localId: randomUUID(),
        amount: data.amount,
        discountAmount: data.discountAmount || undefined,
        currencyCode: data.currencyCode,
        description: data.description,
        merchant: data.merchant ?? undefined,
        categoryId: data.categoryId || undefined,
        date: data.date ? `${data.date}T12:00:00.000Z` : new Date().toISOString(),
        source: 'ocr',
        receiptImageBase64: data.receiptImageBase64,
        receiptMimeType: data.receiptMimeType,
        items: data.items.map((item, index) => ({
          description: item.description,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || item.totalPrice,
          totalPrice: item.totalPrice,
          sortOrder: index,
        })),
      });

      await this.redis.del(`wa:receipt:${shortId}`);
      await this.redis.del(`wa:awaiting_date:${waPhoneNumber}`);

      const amountStr = `${data.amount} ${data.currencyCode}`;
      await this.client.sendText(
        waPhoneNumber,
        `${t('expenseCreated', language)}: *${amountStr}* — ${data.description}`,
      );
    } catch (error) {
      this.logger.error(`PhotoHandler.handleReceiptAddCallback error for ${userState.waPhoneNumber}: ${error}`);
      await this.client.sendText(waPhoneNumber, t('somethingWrong', language));
    }
  }

  async handleDateCallback(shortId: string, userState: WhatsAppUserState): Promise<void> {
    const { waPhoneNumber, language } = userState;
    try {
      const raw = await this.redis.get(`wa:receipt:${shortId}`);
      if (!raw) {
        await this.client.sendText(waPhoneNumber, `${t('cancelled', language)} Expired.`);
        return;
      }

      await this.redis.set(`wa:awaiting_date:${waPhoneNumber}`, shortId, 'EX', 600);
      await this.client.sendText(waPhoneNumber, t('sendDate', language));
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDateCallback error for ${userState.waPhoneNumber}: ${error}`);
      await this.client.sendText(waPhoneNumber, t('somethingWrong', language));
    }
  }

  async handleReceiptCancelCallback(shortId: string, userState: WhatsAppUserState): Promise<void> {
    const { waPhoneNumber, language } = userState;
    try {
      await this.redis.del(`wa:receipt:${shortId}`);
      await this.redis.del(`wa:awaiting_date:${waPhoneNumber}`);
      await this.client.sendText(waPhoneNumber, t('receiptCancelled', language));
    } catch (error) {
      this.logger.error(`PhotoHandler.handleReceiptCancelCallback error for ${userState.waPhoneNumber}: ${error}`);
      await this.client.sendText(waPhoneNumber, t('somethingWrong', language));
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
}
