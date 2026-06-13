import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';

export type BillingCycle = 'monthly' | 'yearly' | 'quarterly' | 'weekly';

// Exported for testing. Uses set-to-1st trick to avoid month-overflow on dates like Jan 31.
export function addCycle(date: Date, cycle: BillingCycle): Date {
  const next = new Date(date);
  if (cycle === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    const day = next.getDate();
    next.setDate(1); // avoid overflow when adding months/years
    if (cycle === 'quarterly') next.setMonth(next.getMonth() + 3);
    else if (cycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
    else next.setMonth(next.getMonth() + 1); // monthly
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
}

@Injectable()
export class SubscriptionRenewalCron {
  private readonly logger = new Logger(SubscriptionRenewalCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs daily at 08:00 UTC.
   * For each active subscription whose nextRenewalDate has arrived (<= today),
   * creates an expense dated on the renewal date (attributed to the account
   * owner) and advances nextRenewalDate by one billing cycle — atomically, so a
   * crash can't double-charge. At most one charge per subscription per run, so
   * a long-overdue subscription catches up one period per day instead of
   * creating a burst of expenses at once.
   */
  @Cron('0 8 * * *')
  async handleDueRenewals() {
    this.logger.log('Running subscription auto-charge cron...');

    const today = new Date();
    today.setHours(23, 59, 59, 999); // include anything due up to end of today

    const due = await this.prisma.userSubscription.findMany({
      where: { isActive: true, nextRenewalDate: { lte: today } },
    });

    if (due.length === 0) {
      this.logger.log('No subscription renewals due');
      return;
    }

    let charged = 0;
    for (const sub of due) {
      const owner = await this.prisma.accountMember.findFirst({
        where: { accountId: sub.accountId, role: 'owner' },
        select: { userId: true },
        orderBy: { joinedAt: 'asc' },
      });
      const fallback = owner
        ? null
        : await this.prisma.accountMember.findFirst({
            where: { accountId: sub.accountId },
            select: { userId: true },
            orderBy: { joinedAt: 'asc' },
          });
      const userId = owner?.userId ?? fallback?.userId;
      if (!userId) {
        this.logger.warn(`Subscription ${sub.id}: account ${sub.accountId} has no members; skipping`);
        continue;
      }

      const chargeDate = new Date(sub.nextRenewalDate);
      chargeDate.setHours(0, 0, 0, 0);
      const cycle = (['monthly', 'yearly', 'quarterly', 'weekly'].includes(sub.billingCycle)
        ? sub.billingCycle
        : 'monthly') as BillingCycle;
      const nextDate = addCycle(chargeDate, cycle);

      try {
        await this.prisma.$transaction([
          this.prisma.expense.create({
            data: {
              clientId: randomUUID(),
              accountId: sub.accountId,
              userId,
              amount: sub.amount,
              currencyCode: sub.currencyCode,
              description: sub.name,
              categoryId: sub.categoryId ?? null,
              date: chargeDate,
              source: 'manual',
            },
          }),
          this.prisma.userSubscription.update({
            where: { id: sub.id },
            data: { nextRenewalDate: nextDate },
          }),
        ]);
        charged++;
      } catch (err) {
        this.logger.error(`Failed to auto-charge subscription ${sub.id}: ${err}`);
        continue;
      }

      const amount = Number(sub.amount).toFixed(2);
      const { name, currencyCode } = sub;
      this.notificationsService
        .sendToUser(
          userId,
          (lang) => ni18n.subscriptionChargedTitle(lang, { name }),
          (lang) => ni18n.subscriptionChargedBody(lang, { name, amount, currencyCode }),
          { subscriptionId: sub.id, charged: true },
          'subscription_renewal',
        )
        .catch(() => {});
    }

    this.logger.log(`Subscription auto-charge complete — created ${charged} expense(s)`);
  }

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
            (lang) => ni18n.subscriptionReminderTitle(lang, { name }),
            (lang) => ni18n.subscriptionReminderBody(lang, { name, amount, currencyCode }),
            { subscriptionId: sub.id },
            'subscription_renewal',
          )
          .catch(() => {});
      }
    }

    this.logger.log(`Sent renewal reminders for ${subscriptions.length} subscriptions`);
  }
}
