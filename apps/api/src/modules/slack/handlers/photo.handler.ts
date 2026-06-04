import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { OcrService } from '../../ai/services/ocr.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { SlackClientService } from '../slack-client.service';
import { SLACK_REDIS, SlackFile, SlackUserState } from '../types';
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
    private readonly client: SlackClientService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  async handleImage(file: SlackFile, userState: SlackUserState): Promise<void> {
    const { userId, accountId, channel, language } = userState;
    const teamId = userState.slackTeamId;
    let ts: string | undefined;
    try {
      if (userState.accountRole === 'viewer') {
        await this.client.sendText(teamId, channel, t('viewerRestricted', language));
        return;
      }

      // Track AI usage before downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'ocr', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.client.sendText(teamId, channel, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      const imageUrl = file.url_private_download;
      if (!imageUrl) {
        this.logger.warn(`Image file ${file.id} has no url_private_download`);
        await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
        return;
      }

      // Post placeholder before OCR — the slow part
      ts = await this.client.postPlaceholder(teamId, channel, t('thinking', language));

      const { buffer, mimeType } = await this.client.downloadFile(
        teamId,
        imageUrl,
        file.mimetype,
      );
      const base64 = buffer.toString('base64');

      const receipt = await this.ocrService.parseReceipt(base64, userId, accountId);

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
        merchant: receipt.merchant,
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        receiptMimeType: mimeType || 'image/jpeg',
        language,
      };
      await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

      const summary = this.buildSummaryText(receipt.amount, receipt.currencyCode, receipt.date, receipt.merchant, language);
      await this.client.replyButtons(teamId, channel, ts, summary, [
        { id: `receipt_add:${shortId}`, title: t('addExpense', language) },
        { id: `receipt_date:${shortId}`, title: t('changeDate', language) },
        { id: `receipt_cancel:${shortId}`, title: t('cancel', language) },
      ]);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleImage error for ${userState.channel}: ${error}`);
      await this.client.replyText(userState.slackTeamId, userState.channel, ts, t('receiptScanFailed', userState.language));
    }
  }

  async handleDocument(file: SlackFile, userState: SlackUserState): Promise<void> {
    const { userId, accountId, channel, language } = userState;
    const teamId = userState.slackTeamId;
    let ts: string | undefined;
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

      // Track AI usage before downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'ocr', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.client.sendText(teamId, channel, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      const docUrl = file.url_private_download;
      if (!docUrl) {
        this.logger.warn(`Document file ${file.id} has no url_private_download`);
        await this.client.sendText(teamId, channel, t('receiptScanFailed', language));
        return;
      }

      // Post placeholder before OCR — the slow part
      ts = await this.client.postPlaceholder(teamId, channel, t('thinking', language));

      const { buffer } = await this.client.downloadFile(
        teamId,
        docUrl,
        file.mimetype,
      );
      const base64 = buffer.toString('base64');

      let receipt;
      if (mimeType === 'application/pdf') {
        receipt = await this.ocrService.parseReceiptPdf(base64, userId, accountId);
      } else {
        receipt = await this.ocrService.parseReceipt(base64, userId, accountId);
      }

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
        merchant: receipt.merchant,
        items: receipt.receiptItems || [],
        receiptImageBase64: base64,
        receiptMimeType: mimeType,
        language,
      };
      await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);

      const summary = this.buildSummaryText(receipt.amount, receipt.currencyCode, receipt.date, receipt.merchant, language);
      await this.client.replyButtons(teamId, channel, ts, summary, [
        { id: `receipt_add:${shortId}`, title: t('addExpense', language) },
        { id: `receipt_date:${shortId}`, title: t('changeDate', language) },
        { id: `receipt_cancel:${shortId}`, title: t('cancel', language) },
      ]);
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDocument error for ${userState.channel}: ${error}`);
      await this.client.replyText(userState.slackTeamId, userState.channel, ts, t('receiptScanFailed', userState.language));
    }
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

      // Read-modify-write the receipt JSON in Redis
      const raw = await this.redis.get(`slack:receipt:${shortId}`);
      if (!raw) {
        // Receipt expired — clear the awaiting-date state and return
        await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);
        await this.client.sendText(teamId, channel, `${t('cancelled', language)} Expired.`);
        return true;
      }

      const data: PendingReceiptData = JSON.parse(raw);
      data.date = dateStr;
      await this.redis.set(`slack:receipt:${shortId}`, JSON.stringify(data), 'EX', 1800);
      await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);

      const formattedDate = `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
      await this.client.sendText(teamId, channel, t('dateUpdated', language, { date: formattedDate }));

      // Re-send the 3 buttons with updated receipt info
      const summary = this.buildSummaryText(data.amount, data.currencyCode, dateStr, data.merchant, language);
      await this.client.sendButtons(teamId, channel, summary, [
        { id: `receipt_add:${shortId}`, title: t('addExpense', language) },
        { id: `receipt_date:${shortId}`, title: t('changeDate', language) },
        { id: `receipt_cancel:${shortId}`, title: t('cancel', language) },
      ]);

      return true;
    } catch (error) {
      this.logger.error(`PhotoHandler.handleDateInput error for ${userState.channel}: ${error}`);
      return false;
    }
  }

  async handleReceiptAddCallback(shortId: string, userState: SlackUserState): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      const raw = await this.redis.get(`slack:receipt:${shortId}`);
      if (!raw) {
        await this.client.sendText(teamId, channel, `${t('cancelled', language)} Expired.`);
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

      await this.redis.del(`slack:receipt:${shortId}`);
      await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);

      const amountStr = `${data.amount} ${data.currencyCode}`;
      await this.client.sendText(
        teamId,
        channel,
        `${t('expenseCreated', language)}: *${amountStr}* — ${data.description}`,
      );
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

  async handleReceiptCancelCallback(shortId: string, userState: SlackUserState): Promise<void> {
    const { channel, language } = userState;
    const teamId = userState.slackTeamId;
    try {
      await this.redis.del(`slack:receipt:${shortId}`);
      await this.redis.del(`slack:awaiting_date:${userState.slackUserId}`);
      await this.client.sendText(teamId, channel, t('receiptCancelled', language));
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
}
