import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async setBalance(accountId: string, userId: string, dto: any) {
    return this.prisma.walletBalance.upsert({
      where: {
        accountId_currencyCode: {
          accountId,
          currencyCode: dto.currencyCode,
        },
      },
      update: {
        initialAmount: dto.initialAmount,
        isDeleted: false,
        syncVersion: { increment: 1 },
      },
      create: {
        accountId,
        userId,
        clientId: dto.localId,
        currencyCode: dto.currencyCode,
        initialAmount: dto.initialAmount,
      },
    });
  }

  async findAll(accountId: string) {
    return this.prisma.walletBalance.findMany({
      where: { accountId, isDeleted: false },
      orderBy: { currencyCode: 'asc' },
    });
  }

  async remove(accountId: string, currencyCode: string) {
    const balance = await this.prisma.walletBalance.findUnique({
      where: {
        accountId_currencyCode: { accountId, currencyCode },
      },
    });

    if (!balance || balance.isDeleted) {
      throw new NotFoundException('Wallet balance not found');
    }

    await this.prisma.walletBalance.update({
      where: { id: balance.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    return { success: true };
  }

  async getSummary(accountId: string) {
    // Get all wallet balances
    const walletBalances = await this.prisma.walletBalance.findMany({
      where: { accountId, isDeleted: false },
    });

    // Get expense totals grouped by currency
    const expenseTotals = await this.prisma.expense.groupBy({
      by: ['currencyCode'],
      where: { accountId, isDeleted: false },
      _sum: { amount: true },
    });

    // Get exchange totals (money going out per currency)
    const exchangeOut = await this.prisma.currencyExchange.groupBy({
      by: ['fromCurrency'],
      where: { accountId, isDeleted: false },
      _sum: { fromAmount: true },
    });

    // Get exchange totals (money coming in per currency)
    const exchangeIn = await this.prisma.currencyExchange.groupBy({
      by: ['toCurrency'],
      where: { accountId, isDeleted: false },
      _sum: { toAmount: true },
    });

    // Build expense map
    const expenseMap = new Map<string, number>();
    for (const e of expenseTotals) {
      expenseMap.set(e.currencyCode, Number(e._sum.amount || 0));
    }

    // Build exchange maps
    const exchangeOutMap = new Map<string, number>();
    for (const e of exchangeOut) {
      exchangeOutMap.set(e.fromCurrency, Number(e._sum.fromAmount || 0));
    }

    const exchangeInMap = new Map<string, number>();
    for (const e of exchangeIn) {
      exchangeInMap.set(e.toCurrency, Number(e._sum.toAmount || 0));
    }

    // Compute balances
    const balances = walletBalances.map((wb) => {
      const initialAmount = Number(wb.initialAmount);
      const totalExpenses = expenseMap.get(wb.currencyCode) || 0;
      const totalExchangedIn = exchangeInMap.get(wb.currencyCode) || 0;
      const totalExchangedOut = exchangeOutMap.get(wb.currencyCode) || 0;
      const currentBalance = initialAmount - totalExpenses + totalExchangedIn - totalExchangedOut;

      return {
        currencyCode: wb.currencyCode,
        initialAmount,
        totalExpenses,
        totalExchangedIn,
        totalExchangedOut,
        currentBalance,
      };
    });

    return { balances };
  }
}
