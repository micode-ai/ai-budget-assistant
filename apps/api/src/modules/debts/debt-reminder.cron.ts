import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '@budget/shared-types/notification-strings';

@Injectable()
export class DebtReminderCron {
  private readonly logger = new Logger(DebtReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs daily at 09:00 UTC.
   * Sends push notifications for debts due in 3 days and debts that became overdue yesterday.
   */
  @Cron('0 9 * * *')
  async handleDebtReminders() {
    this.logger.log('Running debt reminder cron...');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const threeDaysStart = new Date(todayStart);
    threeDaysStart.setDate(todayStart.getDate() + 3);
    const threeDaysEnd = new Date(threeDaysStart);
    threeDaysEnd.setHours(23, 59, 59, 999);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    await Promise.all([
      this.notifyLentDebts(threeDaysStart, threeDaysEnd, 'upcoming'),
      this.notifyLentDebts(yesterdayStart, yesterdayEnd, 'overdue'),
      this.notifyBorrowedDebts(threeDaysStart, threeDaysEnd, 'upcoming'),
      this.notifyBorrowedDebts(yesterdayStart, yesterdayEnd, 'overdue'),
    ]);

    this.logger.log('Debt reminder cron complete');
  }

  private async notifyLentDebts(
    rangeStart: Date,
    rangeEnd: Date,
    kind: 'upcoming' | 'overdue',
  ) {
    const debts = await this.prisma.expense.findMany({
      where: {
        isDebt: true,
        isDeleted: false,
        debtDueDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        currencyCode: true,
        debtContactName: true,
      },
    });

    if (debts.length === 0) return;

    const debtIds = debts.map((d) => d.id);
    const repayments = await this.prisma.income.findMany({
      where: {
        relatedDebtExpenseId: { in: debtIds },
        isDebtRepayment: true,
        isDeleted: false,
      },
      select: { relatedDebtExpenseId: true, amount: true },
    });

    const repaidByDebt = new Map<string, number>();
    for (const r of repayments) {
      if (!r.relatedDebtExpenseId) continue;
      repaidByDebt.set(
        r.relatedDebtExpenseId,
        (repaidByDebt.get(r.relatedDebtExpenseId) ?? 0) + Number(r.amount),
      );
    }

    for (const debt of debts) {
      const remaining = Number(debt.amount) - (repaidByDebt.get(debt.id) ?? 0);
      if (remaining <= 0) continue;

      const contactName = debt.debtContactName || 'Unknown';
      const amount = remaining.toFixed(2);
      const currencyCode = debt.currencyCode;

      if (kind === 'upcoming') {
        this.notificationsService
          .sendToUser(
            debt.userId,
            (lang) => ni18n.debtUpcomingTitle(lang, { contactName, days: 3, amount, currencyCode, type: 'lent' }),
            (lang) => ni18n.debtUpcomingBody(lang, { contactName, days: 3, amount, currencyCode, type: 'lent' }),
            { debtId: debt.id },
            'debt_reminder',
          )
          .catch(() => {});
      } else {
        this.notificationsService
          .sendToUser(
            debt.userId,
            (lang) => ni18n.debtOverdueTitle(lang, { contactName, amount, currencyCode, type: 'lent' }),
            (lang) => ni18n.debtOverdueBody(lang, { contactName, amount, currencyCode, type: 'lent' }),
            { debtId: debt.id },
            'debt_reminder',
          )
          .catch(() => {});
      }
    }
  }

  private async notifyBorrowedDebts(
    rangeStart: Date,
    rangeEnd: Date,
    kind: 'upcoming' | 'overdue',
  ) {
    const debts = await this.prisma.income.findMany({
      where: {
        isDebt: true,
        isDeleted: false,
        debtDueDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        currencyCode: true,
        debtContactName: true,
      },
    });

    if (debts.length === 0) return;

    const debtIds = debts.map((d) => d.id);
    const repayments = await this.prisma.expense.findMany({
      where: {
        relatedDebtIncomeId: { in: debtIds },
        isDebtRepayment: true,
        isDeleted: false,
      },
      select: { relatedDebtIncomeId: true, amount: true },
    });

    const repaidByDebt = new Map<string, number>();
    for (const r of repayments) {
      if (!r.relatedDebtIncomeId) continue;
      repaidByDebt.set(
        r.relatedDebtIncomeId,
        (repaidByDebt.get(r.relatedDebtIncomeId) ?? 0) + Number(r.amount),
      );
    }

    for (const debt of debts) {
      const remaining = Number(debt.amount) - (repaidByDebt.get(debt.id) ?? 0);
      if (remaining <= 0) continue;

      const contactName = debt.debtContactName || 'Unknown';
      const amount = remaining.toFixed(2);
      const currencyCode = debt.currencyCode;

      if (kind === 'upcoming') {
        this.notificationsService
          .sendToUser(
            debt.userId,
            (lang) => ni18n.debtUpcomingTitle(lang, { contactName, days: 3, amount, currencyCode, type: 'borrowed' }),
            (lang) => ni18n.debtUpcomingBody(lang, { contactName, days: 3, amount, currencyCode, type: 'borrowed' }),
            { debtId: debt.id },
            'debt_reminder',
          )
          .catch(() => {});
      } else {
        this.notificationsService
          .sendToUser(
            debt.userId,
            (lang) => ni18n.debtOverdueTitle(lang, { contactName, amount, currencyCode, type: 'borrowed' }),
            (lang) => ni18n.debtOverdueBody(lang, { contactName, amount, currencyCode, type: 'borrowed' }),
            { debtId: debt.id },
            'debt_reminder',
          )
          .catch(() => {});
      }
    }
  }
}
