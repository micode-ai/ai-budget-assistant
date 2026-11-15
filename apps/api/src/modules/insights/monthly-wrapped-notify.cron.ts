import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WrappedService } from './wrapped.service';
import { InsightNotificationLedger } from './insight-notification-ledger.service';
import * as ni18n from '../notifications/notification-i18n';
import { paginateById } from '../../common/utils/paginate';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { financialMonth, shiftFinancialMonth } from '../../common/utils/financial-month';

const BATCH_SIZE = 500;

/** The calendar month before `now`, as { year, month: 1-12 }. */
export function previousMonth(now: Date): { year: number; month: number } {
  const m = now.getMonth(); // 0-11; the previous month's 1-12 number is exactly this
  return m === 0 ? { year: now.getFullYear() - 1, month: 12 } : { year: now.getFullYear(), month: m };
}

/**
 * The (financial) month that ENDED yesterday, named by the month it started in, or
 * null when no period turned over today for this anchor (ABA-782). A calendar
 * account turns over on the 1st; salary on the 10th turns over on the 10th; an
 * anchor of 31 turns over on the last day of a shorter month.
 */
export function periodEndedYesterday(now: Date, anchorDay: number | null): { year: number; month: number } | null {
  const { start } = financialMonth(now, anchorDay);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (start.getTime() !== today.getTime()) return null;
  const prevStart = financialMonth(shiftFinancialMonth(start, -1, anchorDay), anchorDay).start;
  return { year: prevStart.getFullYear(), month: prevStart.getMonth() + 1 };
}

export function monthlyWrappedDedupKey(userId: string, year: number, month: number): string {
  return `wrapped:${userId}:${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Monthly Wrapped push (ABA-641): when a user's month turns over — the 1st for a calendar account,
 * the anchor day for a financial month (ABA-782, so the cron runs daily) — tell them their deck for
 * the month just ended is ready — but only when that deck has data, so the push never opens an empty screen.
 * One push per user, for their default account only (a member of several accounts would otherwise get
 * one per account), in their own display currency. Computing the deck here also warms its cache for
 * the tap that follows. Deduped through `InsightNotificationLedger`, so a re-run the same day is a no-op.
 */
@Injectable()
export class MonthlyWrappedNotifyCron {
  private readonly logger = new Logger(MonthlyWrappedNotifyCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly wrappedService: WrappedService,
    private readonly ledger: InsightNotificationLedger,
  ) {}

  @Cron('0 9 * * *')
  async handleMonthlyWrapped(now: Date = new Date()) {
    let sent = 0;

    const pages = paginateById(
      (cursor) =>
        this.prisma.user.findMany({
          where: {
            notifyMonthlyWrapped: true,
            pushToken: { not: null },
            isActive: true,
            defaultAccountId: { not: null },
          },
          select: { id: true, defaultAccountId: true, currencyCode: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    for await (const users of pages) {
      // One lookup per batch: each default account's anchor decides whether its
      // month turned over today.
      const accountIds = [...new Set(users.map((u) => u.defaultAccountId).filter((id): id is string => !!id))];
      const anchors = new Map(
        (
          await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, monthAnchorDay: true },
          })
        ).map((a) => [a.id, a.monthAnchorDay ?? null]),
      );
      for (const u of users) {
        const accountId = u.defaultAccountId;
        if (!accountId) continue;
        const anchorDay = anchors.get(accountId) ?? null;
        const ended = periodEndedYesterday(now, anchorDay);
        if (!ended) continue;
        const { year, month } = ended;
        try {
          const deck = await this.wrappedService.getMonthlyWrapped(accountId, u.id, u.currencyCode || 'USD', year, month, anchorDay);
          if (!deck.hasEnoughData) continue;
          if (!(await this.ledger.tryRecord(accountId, 'monthly_wrapped', monthlyWrappedDedupKey(u.id, year, month)))) continue;

          this.notificationsService
            .sendToUser(
              u.id,
              (lang) => ni18n.monthlyWrappedTitle(lang),
              (lang) => ni18n.monthlyWrappedBody(lang),
              { type: 'monthly_wrapped', year, month },
              'monthly_wrapped',
            )
            .catch(logFireAndForget(this.logger, 'MonthlyWrappedNotifyCron.sendToUser'));
          sent++;
        } catch (e) {
          this.logger.warn(`monthly wrapped notify failed for user ${u.id}`, e as Error);
        }
      }
    }

    this.logger.log(`monthly wrapped: ${sent} pushes queued`);
  }
}
