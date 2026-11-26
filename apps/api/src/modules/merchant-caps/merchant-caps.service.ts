import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { UpsertMerchantCapDto } from './dto';
import { sumRefundsForExpenses } from '../../common/utils/refund-netting';

export const MERCHANT_CAP_THRESHOLDS = [80, 100];
export const MAX_MERCHANT_CAPS_PER_ACCOUNT = 30;

/** Same key as the merchant category rules. */
export function merchantKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/** `YYYY-MM` and the calendar-month bounds for `today` (local server date). */
export function monthPeriod(today: Date) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return {
    period: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: new Date(y, m, 1),
    end: new Date(y, m + 1, 0, 23, 59, 59, 999),
  };
}

/** Highest threshold reached, or null below the first. */
export function reachedThreshold(percentUsed: number): number | null {
  let hit: number | null = null;
  for (const t of MERCHANT_CAP_THRESHOLDS) if (percentUsed >= t) hit = t;
  return hit;
}

@Injectable()
export class MerchantCapsService {
  private readonly logger = new Logger(MerchantCapsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async spentAtMerchant(
    accountId: string,
    cap: { merchantNormalized: string; currencyCode: string },
    start: Date,
    end: Date,
  ): Promise<number> {
    const agg = await this.prisma.expense.aggregate({
      where: {
        accountId,
        currencyCode: cap.currencyCode,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        merchant: { equals: cap.merchantNormalized, mode: 'insensitive' },
        date: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    // Linked refunds (same currency, original at this merchant and live) net the spend.
    const refunded = await sumRefundsForExpenses(
      this.prisma as any,
      accountId,
      { merchant: { equals: cap.merchantNormalized, mode: 'insensitive' } },
      { gte: start, lte: end },
      cap.currencyCode,
    );
    return Math.max(0, Math.round((Number(agg._sum.amount ?? 0) - refunded) * 100) / 100);
  }

  private async toResponse(cap: any, today = new Date()) {
    const { start, end } = monthPeriod(today);
    const spent = await this.spentAtMerchant(cap.accountId, cap, start, end);
    const amount = Number(cap.amount);
    return {
      id: cap.id as string,
      merchantNormalized: cap.merchantNormalized as string,
      merchantLabel: cap.merchantLabel as string,
      amount,
      currencyCode: cap.currencyCode as string,
      spent,
      percentUsed: amount > 0 ? (spent / amount) * 100 : 0,
    };
  }

  async list(accountId: string) {
    const caps = await this.prisma.merchantSpendingCap.findMany({
      where: { accountId },
      orderBy: { merchantNormalized: 'asc' },
    });
    return Promise.all(caps.map((c) => this.toResponse(c)));
  }

  async upsert(accountId: string, userId: string, dto: UpsertMerchantCapDto) {
    const key = merchantKey(dto.merchant);
    if (!key) throw new BadRequestException('Merchant is required');
    const existing = await this.prisma.merchantSpendingCap.findUnique({
      where: { accountId_merchantNormalized: { accountId, merchantNormalized: key } },
      select: { id: true },
    });
    if (!existing) {
      const count = await this.prisma.merchantSpendingCap.count({ where: { accountId } });
      if (count >= MAX_MERCHANT_CAPS_PER_ACCOUNT) {
        throw new BadRequestException(`At most ${MAX_MERCHANT_CAPS_PER_ACCOUNT} merchant caps per account`);
      }
    }
    const data = {
      amount: dto.amount,
      currencyCode: dto.currencyCode.toUpperCase(),
      merchantLabel: dto.merchant.trim(),
      // A changed cap may be crossed again.
      lastAlertPeriod: null,
      lastAlertThreshold: null,
    };
    const cap = await this.prisma.merchantSpendingCap.upsert({
      where: { accountId_merchantNormalized: { accountId, merchantNormalized: key } },
      create: { accountId, userId, merchantNormalized: key, ...data },
      update: data,
    });
    return this.toResponse(cap);
  }

  async remove(accountId: string, id: string): Promise<{ success: true }> {
    const res = await this.prisma.merchantSpendingCap.deleteMany({ where: { id, accountId } });
    if (res.count === 0) throw new NotFoundException('Cap not found');
    return { success: true };
  }

  /** Expense-write hook. Never throws. */
  async checkAccount(accountId: string, currencyCode: string, today = new Date()): Promise<void> {
    try {
      const caps = await this.prisma.merchantSpendingCap.findMany({ where: { accountId, currencyCode } });
      const { period, start, end } = monthPeriod(today);
      for (const cap of caps) {
        const amount = Number(cap.amount);
        if (amount <= 0) continue;
        const spent = await this.spentAtMerchant(accountId, cap, start, end);
        const threshold = reachedThreshold((spent / amount) * 100);
        if (threshold === null) continue;
        const already = cap.lastAlertPeriod === period ? (cap.lastAlertThreshold ?? 0) : 0;
        if (threshold <= already) continue;

        // Claim BEFORE sending so concurrent writes push once; the where-clause is the CAS.
        const claim = await this.prisma.merchantSpendingCap.updateMany({
          where: {
            id: cap.id,
            lastAlertPeriod: cap.lastAlertPeriod,
            lastAlertThreshold: cap.lastAlertThreshold,
          },
          data: { lastAlertPeriod: period, lastAlertThreshold: threshold },
        });
        if (claim.count === 0) continue;

        const params = {
          merchant: cap.merchantLabel,
          threshold,
          spent: spent.toFixed(2),
          cap: amount.toFixed(2),
          currencyCode: cap.currencyCode,
        };
        const ok = await this.notifications.sendToUser(
          cap.userId,
          (lang: string) => ni18n.merchantCapTitle(lang, params),
          (lang: string) => ni18n.merchantCapBody(lang, params),
          { capId: cap.id, thresholdPercentage: threshold, merchant: cap.merchantLabel },
          'budget_alert',
        );
        if (!ok) {
          await this.prisma.merchantSpendingCap.updateMany({
            where: { id: cap.id, lastAlertPeriod: period, lastAlertThreshold: threshold },
            data: { lastAlertPeriod: cap.lastAlertPeriod, lastAlertThreshold: cap.lastAlertThreshold },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Merchant cap check failed: ${error}`);
    }
  }
}
