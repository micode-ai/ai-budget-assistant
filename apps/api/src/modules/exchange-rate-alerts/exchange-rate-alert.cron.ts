import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import * as ni18n from '../notifications/notification-i18n';
import { paginateById } from '../../common/utils/paginate';

/** How long a triggered (isActive:false) watch's history row is kept before cleanup. */
const RATE_WATCH_HISTORY_RETENTION_DAYS = 90;

/**
 * Hourly check of every active "notify me when this pair hits my target" watch.
 *
 * Cadence: hourly, not more — ExchangeRateService already caches each base
 * currency's rates for 1h in-process, and watches are grouped by fromCurrency
 * before calling it, so this never costs more than one provider call per
 * distinct fromCurrency actually being watched (at most 7 — the whole
 * supported-currency list), independent of how many users/watches exist.
 *
 * One-shot: a watch fires once, then isActive flips false. No per-type
 * notification preference gate exists for 'rate_watch_hit' — the watch's own
 * existence is the opt-in (delete it to stop), same precedent as
 * account_invitation/split_payment_claimed.
 */
@Injectable()
export class ExchangeRateAlertCron {
  private readonly logger = new Logger(ExchangeRateAlertCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  @Cron('0 * * * *')
  async checkWatches(): Promise<void> {
    const pages = paginateById((cursor) =>
      this.prisma.exchangeRateWatch.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    );

    for await (const page of pages) {
      const byFromCurrency = new Map<string, typeof page>();
      for (const watch of page) {
        const bucket = byFromCurrency.get(watch.fromCurrency) ?? [];
        bucket.push(watch);
        byFromCurrency.set(watch.fromCurrency, bucket);
      }

      for (const [fromCurrency, watches] of byFromCurrency) {
        let rates: Record<string, number> | null = null;
        try {
          rates = (await this.exchangeRateService.getRates(fromCurrency)).rates;
        } catch (err) {
          this.logger.warn(`Failed to fetch rates for ${fromCurrency}: ${err}`);
          continue;
        }

        for (const watch of watches) {
          try {
            await this.checkOne(watch, rates);
          } catch (err) {
            this.logger.warn(`checkOne failed for watch ${watch.id}: ${err}`);
          }
        }
      }
    }
  }

  /**
   * Daily sweep of fired history — same 03:00 UTC slot and retention convention as
   * shopping-reminder.cron.ts's cleanupOldLogs / family-feed.service.ts's pruneOldEvents.
   * MAX_ACTIVE_WATCHES only bounds the active set; a fired one-shot watch's isActive:false
   * row would otherwise accumulate forever.
   */
  @Cron('0 3 * * *')
  async cleanupOldHistory(): Promise<void> {
    const cutoff = new Date(Date.now() - RATE_WATCH_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.exchangeRateWatch.deleteMany({
        where: { isActive: false, triggeredAt: { lt: cutoff } },
      });
      if (count > 0) this.logger.log(`Pruned ${count} triggered exchange rate watch(es) older than ${RATE_WATCH_HISTORY_RETENTION_DAYS} days`);
    } catch (err) {
      this.logger.warn(`Exchange rate watch history cleanup failed: ${err}`);
    }
  }

  private async checkOne(
    watch: { id: string; userId: string; fromCurrency: string; toCurrency: string; targetRate: unknown; direction: string },
    rates: Record<string, number>,
  ): Promise<void> {
    const rate = rates[watch.toCurrency];
    if (!rate || rate <= 0) return; // unknown rate — try again next run

    const target = Number(watch.targetRate);
    const hit = watch.direction === 'above' ? rate >= target : rate <= target;
    if (!hit) return;

    // Mark as fired BEFORE sending (prevents a concurrent run from double-sending),
    // same precedent as BudgetAlertService.checkBudgetThresholds. If the send fails,
    // roll back to isActive:true so the next hourly run retries — this is a one-shot
    // alert with no other surface telling the user it fired, so a lost push must not
    // be silently final.
    await this.prisma.exchangeRateWatch.update({
      where: { id: watch.id },
      data: { isActive: false, triggeredAt: new Date(), triggeredRate: rate },
    });

    const rateDisplay = rate.toFixed(4);
    const sentOk = await this.notificationsService.sendToUser(
      watch.userId,
      (lang) => ni18n.rateWatchHitTitle(lang, { fromCurrency: watch.fromCurrency, toCurrency: watch.toCurrency }),
      (lang) => ni18n.rateWatchHitBody(lang, { fromCurrency: watch.fromCurrency, toCurrency: watch.toCurrency, rate: rateDisplay }),
      { fromCurrency: watch.fromCurrency, toCurrency: watch.toCurrency },
      'rate_watch_hit',
    );

    if (!sentOk) {
      await this.prisma.exchangeRateWatch.update({
        where: { id: watch.id },
        data: { isActive: true, triggeredAt: null, triggeredRate: null },
      });
    }
  }
}
