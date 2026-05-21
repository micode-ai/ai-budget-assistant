import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DebtsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDebtSummary(accountId: string) {
    // 1. Find all expenses where isDebt=true (money I lent)
    const lentDebts = await this.prisma.expense.findMany({
      where: { accountId, isDebt: true, isDeleted: false },
      orderBy: { date: 'desc' },
    });

    // 2. For each lent debt, find repayment incomes (isDebtRepayment=true, relatedDebtExpenseId=expense.id)
    const lentSummaries = await Promise.all(
      lentDebts.map(async (debt) => {
        const repayments = await this.prisma.income.findMany({
          where: { accountId, isDebtRepayment: true, relatedDebtExpenseId: debt.id, isDeleted: false },
          orderBy: { date: 'asc' },
        });
        const totalRepaid = repayments.reduce((sum, r) => sum + Number(r.amount), 0);
        const remaining = Number(debt.amount) - totalRepaid;
        const now = new Date();
        let status: 'active' | 'paid' | 'overdue' = 'active';
        if (remaining <= 0) status = 'paid';
        else if (debt.debtDueDate && debt.debtDueDate < now) status = 'overdue';

        return {
          id: debt.id,
          type: 'lent' as const,
          contactName: debt.debtContactName || 'Unknown',
          originalAmount: Number(debt.amount),
          currencyCode: debt.currencyCode,
          totalRepaid,
          remainingAmount: Math.max(0, remaining),
          status,
          dueDate: debt.debtDueDate,
          date: debt.date,
          description: debt.description,
          repayments: repayments.map((r) => ({
            id: r.id,
            amount: Number(r.amount),
            date: r.date,
            description: r.description,
          })),
        };
      }),
    );

    // 3. Find all incomes where isDebt=true (money I borrowed)
    const borrowedDebts = await this.prisma.income.findMany({
      where: { accountId, isDebt: true, isDeleted: false },
      orderBy: { date: 'desc' },
    });

    // 4. For each borrowed debt, find repayment expenses
    const borrowedSummaries = await Promise.all(
      borrowedDebts.map(async (debt) => {
        const repayments = await this.prisma.expense.findMany({
          where: { accountId, isDebtRepayment: true, relatedDebtIncomeId: debt.id, isDeleted: false },
          orderBy: { date: 'asc' },
        });
        const totalRepaid = repayments.reduce((sum, r) => sum + Number(r.amount), 0);
        const remaining = Number(debt.amount) - totalRepaid;
        const now = new Date();
        let status: 'active' | 'paid' | 'overdue' = 'active';
        if (remaining <= 0) status = 'paid';
        else if (debt.debtDueDate && debt.debtDueDate < now) status = 'overdue';

        return {
          id: debt.id,
          type: 'borrowed' as const,
          contactName: debt.debtContactName || 'Unknown',
          originalAmount: Number(debt.amount),
          currencyCode: debt.currencyCode,
          totalRepaid,
          remainingAmount: Math.max(0, remaining),
          status,
          dueDate: debt.debtDueDate,
          date: debt.date,
          description: debt.description,
          repayments: repayments.map((r) => ({
            id: r.id,
            amount: Number(r.amount),
            date: r.date,
            description: r.description,
          })),
        };
      }),
    );

    // 5. Compute totals
    const defaultCurrency = lentSummaries[0]?.currencyCode || borrowedSummaries[0]?.currencyCode || 'USD';
    return {
      lent: lentSummaries,
      borrowed: borrowedSummaries,
      totals: {
        totalLent: lentSummaries.reduce((s, d) => s + d.originalAmount, 0),
        totalBorrowed: borrowedSummaries.reduce((s, d) => s + d.originalAmount, 0),
        totalLentRemaining: lentSummaries.reduce((s, d) => s + d.remainingAmount, 0),
        totalBorrowedRemaining: borrowedSummaries.reduce((s, d) => s + d.remainingAmount, 0),
        currencyCode: defaultCurrency,
      },
    };
  }

  async recordRepayment(
    accountId: string,
    userId: string,
    debtId: string,
    amount: number,
    date?: string,
  ) {
    const repayDate = date ? new Date(date) : new Date();

    // Try lent debt (expense with isDebt=true)
    const lentDebt = await this.prisma.expense.findFirst({
      where: { id: debtId, accountId, isDebt: true, isDeleted: false },
    });
    if (lentDebt) {
      const income = await this.prisma.income.create({
        data: {
          userId,
          accountId,
          clientId: `repay-${debtId}-${Date.now()}`,
          amount,
          currencyCode: lentDebt.currencyCode,
          description: `Repayment from ${lentDebt.debtContactName || 'contact'}`,
          date: repayDate,
          isDebtRepayment: true,
          relatedDebtExpenseId: debtId,
          debtContactName: lentDebt.debtContactName,
        },
      });
      return { type: 'lent' as const, record: income };
    }

    // Try borrowed debt (income with isDebt=true)
    const borrowedDebt = await this.prisma.income.findFirst({
      where: { id: debtId, accountId, isDebt: true, isDeleted: false },
    });
    if (borrowedDebt) {
      const expense = await this.prisma.expense.create({
        data: {
          userId,
          accountId,
          clientId: `repay-${debtId}-${Date.now()}`,
          amount,
          currencyCode: borrowedDebt.currencyCode,
          description: `Repayment to ${borrowedDebt.debtContactName || 'contact'}`,
          date: repayDate,
          isDebtRepayment: true,
          relatedDebtIncomeId: debtId,
          debtContactName: borrowedDebt.debtContactName,
        },
      });
      return { type: 'borrowed' as const, record: expense };
    }

    throw new Error(`Debt with id "${debtId}" not found`);
  }

  async createDebt(
    accountId: string,
    userId: string,
    dto: {
      contactName: string;
      amount: number;
      currencyCode: string;
      direction: 'lent' | 'borrowed';
      dueDate?: string;
    },
  ) {
    const date = new Date();
    const debtDueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    const sanitizedContact = dto.contactName.slice(0, 100);

    if (dto.direction === 'lent') {
      const expense = await this.prisma.expense.create({
        data: {
          userId,
          accountId,
          clientId: `debt-lent-${Date.now()}`,
          amount: dto.amount,
          currencyCode: dto.currencyCode,
          description: `Lent to ${sanitizedContact}`,
          date,
          isDebt: true,
          debtContactName: sanitizedContact,
          debtDueDate,
        },
      });
      return { type: 'lent' as const, record: expense };
    } else {
      const income = await this.prisma.income.create({
        data: {
          userId,
          accountId,
          clientId: `debt-borrowed-${Date.now()}`,
          amount: dto.amount,
          currencyCode: dto.currencyCode,
          description: `Borrowed from ${sanitizedContact}`,
          date,
          isDebt: true,
          debtContactName: sanitizedContact,
          debtDueDate,
        },
      });
      return { type: 'borrowed' as const, record: income };
    }
  }
}
