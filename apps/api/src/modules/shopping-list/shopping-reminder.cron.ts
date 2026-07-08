import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShoppingListService } from './shopping-list.service';
import * as ni18n from '../notifications/notification-i18n';

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
      let due;
      try {
        due = await this.shoppingListService.getRestockSuggestions(account.id);
      } catch (e) {
        this.logger.warn(`restock suggestions failed for ${account.id}`, e as Error);
        continue;
      }
      if (!due.length) continue;

      const top = due[0].canonicalName;
      const extra = due.length - 1;
      const members = await this.prisma.accountMember.findMany({
        where: { accountId: account.id, user: { notifyShoppingReminders: true, pushToken: { not: null }, isActive: true } },
        select: { userId: true },
      });
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
  }
}
