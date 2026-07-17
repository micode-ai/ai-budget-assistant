import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';
import { restockDedupKey, dealDedupKey, weekBucket } from './shopping-notification-dedup.util';
import * as ni18n from '../notifications/notification-i18n';
import type { DealSuggestion, RestockSuggestion } from '@budget/shared-types';

const LOG_RETENTION_DAYS = 90;

@Injectable()
export class ShoppingReminderCron {
  private readonly logger = new Logger(ShoppingReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly shoppingListService: ShoppingListService,
    private readonly ledger: ShoppingNotificationLedger,
  ) {}

  /** Per-account, per-type minimum days between sends. Default 2; 0 disables. */
  private minGapDays(): number {
    const v = Number(process.env.SHOPPING_REMINDER_MIN_GAP_DAYS);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 2;
  }

  @Cron('0 10 * * *')
  async handleShoppingReminders() {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const accounts = await this.prisma.account.findMany({
      where: { expenses: { some: { isDeleted: false, date: { gte: since }, items: { some: { canonicalName: { not: null }, isDeleted: false } } } } },
      select: { id: true },
    });

    const gap = this.minGapDays();

    for (const account of accounts) {
      try {
        let due: RestockSuggestion[] = [];
        try {
          due = await this.shoppingListService.getRestockSuggestions(account.id);
        } catch (e) {
          this.logger.warn(`restock suggestions failed for ${account.id}`, e as Error);
        }

        let deals: DealSuggestion[] = [];
        try {
          deals = await this.shoppingListService.getDeals(account.id);
        } catch (e) {
          this.logger.warn(`deal suggestions failed for ${account.id}`, e as Error);
        }

        if (!due.length && !deals.length) continue;

        const members = await this.prisma.accountMember.findMany({
          where: { accountId: account.id, user: { pushToken: { not: null }, isActive: true } },
          select: { userId: true },
        });
        if (!members.length) continue;

        const now = new Date();

        // Restock: once per purchase cycle (dedup key bound to lastPurchase), gated by the global floor.
        if (due.length && !(await this.ledger.withinFloor(account.id, 'shopping_reminder', gap, now))) {
          const top = due[0];
          const key = restockDedupKey(top.canonicalName, top.lastPurchase);
          if (await this.ledger.tryRecord(account.id, 'shopping_reminder', key)) {
            const extra = due.length - 1;
            for (const m of members) {
              this.notificationsService
                .sendToUser(
                  m.userId,
                  (lang) => ni18n.shoppingReminderTitle(lang),
                  (lang) => ni18n.shoppingReminderBody(lang, top.canonicalName, extra),
                  { type: 'shopping_reminder' },
                  'shopping_reminder',
                )
                .catch(() => {});
            }
          }
        }

        // Deals: once per product+merchant+week, gated by the global floor.
        if (deals.length && !(await this.ledger.withinFloor(account.id, 'shopping_deal', gap, now))) {
          const top = deals[0];
          const key = dealDedupKey(top.canonicalName, top.merchant, weekBucket(now));
          if (await this.ledger.tryRecord(account.id, 'shopping_deal', key)) {
            for (const m of members) {
              this.notificationsService
                .sendToUser(
                  m.userId,
                  (lang) => ni18n.shoppingDealTitle(lang),
                  (lang) => ni18n.shoppingDealBody(lang, top.canonicalName, top.merchant, top.dropPct),
                  { type: 'shopping_deal' },
                  'shopping_deal',
                )
                .catch(() => {});
            }
          }
        }
      } catch (e) {
        this.logger.warn(`shopping reminder run failed for ${account.id}`, e as Error);
      }
    }
  }

  @Cron('0 3 * * *')
  async cleanupOldLogs() {
    try {
      const deleted = await this.ledger.deleteOlderThan(LOG_RETENTION_DAYS);
      if (deleted) this.logger.log(`cleaned ${deleted} old shopping notification log rows`);
    } catch (e) {
      this.logger.warn('shopping notification log cleanup failed', e as Error);
    }
  }
}
