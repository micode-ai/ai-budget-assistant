import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';

type RecurringPeriod = 'weekly' | 'monthly' | 'yearly';

function addPeriod(date: Date, period: RecurringPeriod): Date {
  const next = new Date(date);
  if (period === 'weekly') next.setDate(next.getDate() + 7);
  else if (period === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

@Injectable()
export class ExpenseRecurringCron {
  private readonly logger = new Logger(ExpenseRecurringCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs daily at 08:00 UTC.
   * For each recurring expense series, finds the most recent occurrence.
   * If nextDue <= today, clones the expense with today's date.
   */
  @Cron('0 8 * * *')
  async handleRecurringExpenses() {
    this.logger.log('Running recurring expense cron...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all active recurring template expenses (most recent per recurringId)
    // Use a raw group-by approach: fetch all recurring expenses and group in JS
    const allRecurring = await this.prisma.expense.findMany({
      where: {
        isRecurring: true,
        isDeleted: false,
        recurringId: { not: null },
        recurringPeriod: { not: null },
      },
      select: {
        id: true,
        recurringId: true,
        recurringPeriod: true,
        date: true,
        userId: true,
        accountId: true,
        clientId: true,
        amount: true,
        currencyCode: true,
        description: true,
        notes: true,
        categoryId: true,
        source: true,
      },
      orderBy: { date: 'desc' },
    });

    // Group by recurringId, keep only the latest per series
    const latestByRecurringId = new Map<string, typeof allRecurring[number]>();
    for (const exp of allRecurring) {
      if (!exp.recurringId) continue;
      if (!latestByRecurringId.has(exp.recurringId)) {
        latestByRecurringId.set(exp.recurringId, exp);
      }
    }

    let cloned = 0;
    for (const [, template] of latestByRecurringId) {
      const period = template.recurringPeriod as RecurringPeriod;
      const lastDate = new Date(template.date);
      lastDate.setHours(0, 0, 0, 0);
      const nextDue = addPeriod(lastDate, period);

      if (nextDue > today) continue;

      const newClientId = randomUUID();
      try {
        await this.prisma.expense.create({
          data: {
            clientId: newClientId,
            accountId: template.accountId,
            userId: template.userId,
            amount: template.amount,
            currencyCode: template.currencyCode,
            description: template.description,
            notes: template.notes,
            categoryId: template.categoryId,
            date: today,
            source: 'manual',
            isRecurring: true,
            recurringId: template.recurringId,
            recurringPeriod: template.recurringPeriod,
          },
        });
        cloned++;

        // Send push notification
        const amountStr = Number(template.amount).toFixed(2);
        const periodLabel = period;
        await this.notificationsService.sendToUser(
          template.userId,
          (lang) => ni18n.recurringExpenseTitle(lang, {
            description: template.description || '',
            amount: amountStr,
            currencyCode: template.currencyCode,
            period: periodLabel,
          }),
          (lang) => ni18n.recurringExpenseBody(lang, {
            description: template.description || '',
            amount: amountStr,
            currencyCode: template.currencyCode,
            period: periodLabel,
          }),
          { expenseRecurringId: template.recurringId },
          'recurring_expense',
        );
      } catch (err) {
        this.logger.error(`Failed to clone recurring expense ${template.id}: ${err}`);
      }
    }

    this.logger.log(`Recurring expense cron complete — cloned ${cloned} expense(s)`);
  }
}
