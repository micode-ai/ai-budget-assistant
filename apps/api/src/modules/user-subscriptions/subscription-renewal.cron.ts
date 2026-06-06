import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SubscriptionRenewalCron {
  private readonly logger = new Logger(SubscriptionRenewalCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 9 * * *')
  async handleRenewalReminders() {
    this.logger.log('Running subscription renewal reminder cron...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    const threeDaysEnd = new Date(threeDaysFromNow);
    threeDaysEnd.setHours(23, 59, 59, 999);

    const subscriptions = await this.prisma.userSubscription.findMany({
      where: {
        isActive: true,
        nextRenewalDate: { gte: threeDaysFromNow, lte: threeDaysEnd },
      },
      include: {
        account: {
          include: {
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (subscriptions.length === 0) {
      this.logger.log('No subscription renewals in 3 days');
      return;
    }

    for (const sub of subscriptions) {
      const userIds = sub.account.members.map((m) => m.userId);
      const amount = Number(sub.amount).toFixed(2);
      const { name, currencyCode } = sub;

      for (const userId of userIds) {
        this.notificationsService
          .sendToUser(
            userId,
            (lang) => this.getTitle(lang, { name }),
            (lang) => this.getBody(lang, { name, amount, currencyCode }),
            { subscriptionId: sub.id },
            'subscription_renewal',
          )
          .catch(() => {});
      }
    }

    this.logger.log(`Sent renewal reminders for ${subscriptions.length} subscriptions`);
  }

  private getTitle(lang: string, p: { name: string }): string {
    const titles: Record<string, string> = {
      en: `${p.name} renews in 3 days`,
      ru: `${p.name} продлится через 3 дня`,
      ua: `${p.name} поновлюється через 3 дні`,
      de: `${p.name} verlängert sich in 3 Tagen`,
      es: `${p.name} se renueva en 3 días`,
      fr: `${p.name} se renouvelle dans 3 jours`,
      pl: `${p.name} odnawia się za 3 dni`,
      be: `${p.name} аднаўляецца праз 3 дні`,
      nl: `${p.name} verlengt over 3 dagen`,
    };
    return titles[lang] ?? titles.en;
  }

  private getBody(lang: string, p: { name: string; amount: string; currencyCode: string }): string {
    const bodies: Record<string, string> = {
      en: `${p.amount} ${p.currencyCode} will be charged for ${p.name}`,
      ru: `${p.amount} ${p.currencyCode} будет списано за ${p.name}`,
      ua: `${p.amount} ${p.currencyCode} буде знято за ${p.name}`,
      de: `${p.amount} ${p.currencyCode} wird für ${p.name} abgebucht`,
      es: `${p.amount} ${p.currencyCode} se cobrarán por ${p.name}`,
      fr: `${p.amount} ${p.currencyCode} seront prélevés pour ${p.name}`,
      pl: `${p.amount} ${p.currencyCode} zostanie pobrane za ${p.name}`,
      be: `${p.amount} ${p.currencyCode} будзе спісана за ${p.name}`,
      nl: `${p.amount} ${p.currencyCode} wordt afgeschreven voor ${p.name}`,
    };
    return bodies[lang] ?? bodies.en;
  }
}
