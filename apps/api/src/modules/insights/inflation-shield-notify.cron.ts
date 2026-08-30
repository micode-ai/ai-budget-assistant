import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InflationShieldService } from './inflation-shield.service';
import { InsightNotificationLedger } from './insight-notification-ledger.service';
import { shieldDedupKey, monthBucket } from './insight-notification-dedup.util';
import * as ni18n from '../notifications/notification-i18n';
import { logFireAndForget } from '../../common/utils/fire-and-forget';

const LOG_RETENTION_DAYS = 90;

/**
 * Daily proactive push for the Inflation Shield feature: "this product is
 * rising fast, stock up now". Mirrors `ShoppingReminderCron` — a per-account
 * loop, one push per account per month for the single highest-value
 * recommendation, deduped via `InsightNotificationLedger` (insert + catch
 * P2002 = already sent this month for this product).
 */
@Injectable()
export class InflationShieldNotifyCron {
  private readonly logger = new Logger(InflationShieldNotifyCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly inflationShieldService: InflationShieldService,
    private readonly ledger: InsightNotificationLedger,
  ) {}

  @Cron('0 11 * * *')
  async handleInflationShieldNotifications() {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const accounts = await this.prisma.account.findMany({
      where: { expenses: { some: { isDeleted: false, date: { gte: since }, items: { some: { canonicalName: { not: null }, isDeleted: false } } } } },
      select: { id: true },
    });

    for (const account of accounts) {
      try {
        const owner = await this.prisma.accountMember.findFirst({
          where: { accountId: account.id, role: 'owner' },
          select: { userId: true, user: { select: { currencyCode: true } } },
          orderBy: { joinedAt: 'asc' },
        });
        const fallback = owner
          ? null
          : await this.prisma.accountMember.findFirst({
              where: { accountId: account.id },
              select: { userId: true, user: { select: { currencyCode: true } } },
              orderBy: { joinedAt: 'asc' },
            });
        const resolved = owner ?? fallback;
        if (!resolved) continue;
        const ownerUserId = resolved.userId;
        const baseCurrency = resolved.user.currencyCode;

        let shield;
        try {
          shield = await this.inflationShieldService.getShield(account.id, ownerUserId, baseCurrency);
        } catch (e) {
          this.logger.warn(`inflation shield fetch failed for ${account.id}`, e as Error);
          continue;
        }

        if (!shield.hasEnoughData || shield.items.length === 0) continue;

        const top = shield.items.reduce((best, item) => (item.projectedSaving > best.projectedSaving ? item : best));

        const now = new Date();
        const key = shieldDedupKey(top.canonicalName, monthBucket(now));
        if (!(await this.ledger.tryRecord(account.id, 'inflation_shield', key))) continue;

        const members = await this.prisma.accountMember.findMany({
          where: { accountId: account.id, user: { pushToken: { not: null }, isActive: true } },
          select: { userId: true },
        });
        if (!members.length) continue;

        const monthlyChangePct = Math.round(top.monthlyChangePct);
        for (const m of members) {
          this.notificationsService
            .sendToUser(
              m.userId,
              (lang) => ni18n.inflationShieldTitle(lang),
              (lang) => ni18n.inflationShieldBody(lang, top.canonicalName, monthlyChangePct),
              { type: 'inflation_shield' },
              'inflation_shield',
            )
            .catch(logFireAndForget(this.logger, 'InflationShieldNotifyCron.sendToUser'));
        }
      } catch (e) {
        this.logger.warn(`inflation shield notify run failed for ${account.id}`, e as Error);
      }
    }
  }

  @Cron('0 3 * * *')
  async cleanupOldLogs() {
    try {
      const deleted = await this.ledger.deleteOlderThan(LOG_RETENTION_DAYS);
      if (deleted) this.logger.log(`cleaned ${deleted} old insight notification log rows`);
    } catch (e) {
      this.logger.warn('insight notification log cleanup failed', e as Error);
    }
  }
}
