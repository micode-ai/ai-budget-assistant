import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** Pure ranking: merchant/description match counts most, then amount closeness. */
export function scoreRefundCandidate(
  income: { amount: number; description?: string | null },
  expense: { amount: number; merchant?: string | null; description?: string | null },
): number {
  const hint = norm(income.description);
  const names = [norm(expense.merchant), norm(expense.description)].filter(Boolean);
  let score = 0;
  if (hint && names.some((n) => hint.includes(n) || n.includes(hint))) score += 2;
  if (expense.amount > 0) score += Math.max(0, 1 - Math.abs(expense.amount - income.amount) / expense.amount);
  return Math.round(score * 100) / 100;
}

@Injectable()
export class IncomeRefundService {
  constructor(private readonly prisma: PrismaService) {}

  private async findIncome(accountId: string, id: string) {
    const income = await this.prisma.income.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id }, { clientId: id }] },
    });
    if (!income) throw new NotFoundException('Income not found');
    return income;
  }

  /** Sum of live refunds already linked to each expense, optionally leaving one income out. */
  private async refundedSums(accountId: string, expenseIds: string[], exceptIncomeId?: string) {
    const rows = await this.prisma.income.groupBy({
      by: ['refundOfExpenseId'],
      where: {
        accountId,
        isDeleted: false,
        refundOfExpenseId: { in: expenseIds },
        ...(exceptIncomeId ? { id: { not: exceptIncomeId } } : {}),
      },
      _sum: { amount: true },
    });
    return new Map(rows.map((r) => [r.refundOfExpenseId as string, Number(r._sum?.amount ?? 0)]));
  }

  async candidates(accountId: string, incomeId: string) {
    const income = await this.findIncome(accountId, incomeId);
    const amount = Number(income.amount);
    const since = new Date(income.date.getTime() - WINDOW_DAYS * DAY_MS);
    const expenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        isPlanned: false,
        isSplitReceivable: false,
        encryptedPayload: null,
        currencyCode: income.currencyCode,
        date: { gte: since, lte: income.date },
      },
      orderBy: { date: 'desc' },
      take: 200,
      select: { id: true, description: true, merchant: true, amount: true, currencyCode: true, date: true, categoryId: true },
    });
    const refunded = await this.refundedSums(accountId, expenses.map((e) => e.id), income.id);
    return expenses
      .map((e) => {
        const total = Number(e.amount);
        const done = refunded.get(e.id) ?? 0;
        return {
          id: e.id,
          description: e.description,
          merchant: e.merchant,
          amount: total,
          currencyCode: e.currencyCode,
          date: e.date.toISOString(),
          categoryId: e.categoryId,
          refundedAmount: done,
          refundableAmount: Math.max(0, total - done),
          score: scoreRefundCandidate(
            { amount, description: income.description },
            { amount: total, merchant: e.merchant, description: e.description },
          ),
        };
      })
      .filter((c) => c.refundableAmount >= amount)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  async link(accountId: string, incomeId: string, expenseId: string) {
    const income = await this.findIncome(accountId, incomeId);
    if (income.isDebt || income.isDebtRepayment || income.isSplitReceivable || income.encryptedPayload) {
      throw new BadRequestException('This income cannot be marked as a refund');
    }
    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: expenseId }, { clientId: expenseId }] },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.isPlanned || expense.isSplitReceivable || expense.encryptedPayload) {
      throw new BadRequestException('This expense cannot be refunded');
    }
    if (expense.currencyCode !== income.currencyCode) {
      throw new BadRequestException('Refund and original expense must be in the same currency');
    }
    const done = (await this.refundedSums(accountId, [expense.id], income.id)).get(expense.id) ?? 0;
    if (done + Number(income.amount) > Number(expense.amount) + 0.005) {
      throw new BadRequestException('Refunds would exceed the original expense amount');
    }
    return this.prisma.income.update({ where: { id: income.id }, data: { refundOfExpenseId: expense.id } });
  }

  async unlink(accountId: string, incomeId: string) {
    const income = await this.findIncome(accountId, incomeId);
    if (!income.refundOfExpenseId) return income;
    return this.prisma.income.update({ where: { id: income.id }, data: { refundOfExpenseId: null } });
  }
}
