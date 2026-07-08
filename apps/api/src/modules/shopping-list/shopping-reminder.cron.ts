import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShoppingListService } from './shopping-list.service';
import * as ni18n from '../notifications/notification-i18n';
import type { DealSuggestion, RestockSuggestion } from '@budget/shared-types';

@Injectable()
export class ShoppingReminderCron {
  private readonly logger = new Logger(ShoppingReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly shoppingListService: ShoppingListService,
  ) {}

  @Cron('0 10 * * *')
  async handleShoppingReminders() {
    // Accounts with at least one canonical-named receipt item in the last 60 days (active grocery trackers)
    const since = new Date(Date.now() - 60 * 86_400_000);
    const accounts = await this.prisma.account.findMany({
      where: { expenses: { some: { isDeleted: false, date: { gte: since }, items: { some: { canonicalName: { not: null }, isDeleted: false } } } } },
      select: { id: true },
    });

    for (const account of accounts) {
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

      if (due.length) {
        const top = due[0].canonicalName;
        const extra = due.length - 1;
        for (const m of members) {
          this.notificationsService
            .sendToUser(
              m.userId,
              (lang) => ni18n.shoppingReminderTitle(lang),
              (lang) => ni18n.shoppingReminderBody(lang, top, extra),
              { type: 'shopping_reminder' },
              'shopping_reminder',
            )
            .catch(() => {});
        }
      }

      if (deals.length) {
        const top = deals[0];
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
  }
}
