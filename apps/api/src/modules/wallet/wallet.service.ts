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

    // Get income totals grouped by currency
    const incomeTotals = await this.prisma.income.groupBy({
      by: ['currencyCode'],
      where: { accountId, isDeleted: false },
      _sum: { amount: true },
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

    // Get transfers out of this account
    const transfersOut = await this.prisma.accountTransfer.groupBy({
      by: ['fromCurrency'],
      where: { fromAccountId: accountId, isDeleted: false },
      _sum: { fromAmount: true },
    });

    // Get transfers into this account (exclude transfers counted as income to avoid double-counting)
    const transfersIn = await this.prisma.accountTransfer.groupBy({
      by: ['toCurrency'],
      where: { toAccountId: accountId, isDeleted: false, countAsIncome: false },
      _sum: { toAmount: true },
    });

    // Build income map
    const incomeMap = new Map<string, number>();
    for (const i of incomeTotals) {
      incomeMap.set(i.currencyCode, Number(i._sum.amount || 0));
    }

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

    // Build transfer maps
    const transferOutMap = new Map<string, number>();
    for (const t of transfersOut) {
      transferOutMap.set(t.fromCurrency, Number(t._sum.fromAmount || 0));
    }

    const transferInMap = new Map<string, number>();
    for (const t of transfersIn) {
      transferInMap.set(t.toCurrency, Number(t._sum.toAmount || 0));
    }

    // Compute balances
    const balances = walletBalances.map((wb: typeof walletBalances[number]) => {
      const initialAmount = Number(wb.initialAmount);
      const totalIncomes = incomeMap.get(wb.currencyCode) || 0;
      const totalExpenses = expenseMap.get(wb.currencyCode) || 0;
      const totalExchangedIn = exchangeInMap.get(wb.currencyCode) || 0;
      const totalExchangedOut = exchangeOutMap.get(wb.currencyCode) || 0;
      const totalTransferredIn = transferInMap.get(wb.currencyCode) || 0;
      const totalTransferredOut = transferOutMap.get(wb.currencyCode) || 0;
      const currentBalance = initialAmount + totalIncomes - totalExpenses
        + totalExchangedIn - totalExchangedOut
        + totalTransferredIn - totalTransferredOut;

      return {
        currencyCode: wb.currencyCode,
        initialAmount,
        totalIncomes,
        totalExpenses,
        totalExchangedIn,
        totalExchangedOut,
        totalTransferredIn,
        totalTransferredOut,
        currentBalance,
      };
    });

    return { balances };
  }

  async getBalanceHistory(accountId: string, days: number) {
    const cappedDays = Math.min(Math.max(1, days), 90);

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cappedDays);
    startDate.setHours(0, 0, 0, 0);

    // Run all queries in parallel
    const [currentSummary, incomes, expenses, exchanges, transfersOut, transfersIn] =
      await Promise.all([
        this.getSummary(accountId),
        this.prisma.income.findMany({
          where: { accountId, isDeleted: false, date: { gte: startDate, lte: today } },
          select: { date: true, amount: true, currencyCode: true },
        }),
        this.prisma.expense.findMany({
          where: { accountId, isDeleted: false, date: { gte: startDate, lte: today } },
          select: { date: true, amount: true, currencyCode: true },
        }),
        this.prisma.currencyExchange.findMany({
          where: { accountId, isDeleted: false, date: { gte: startDate, lte: today } },
          select: { date: true, fromAmount: true, toAmount: true, fromCurrency: true, toCurrency: true },
        }),
        this.prisma.accountTransfer.findMany({
          where: { fromAccountId: accountId, isDeleted: false, date: { gte: startDate, lte: today } },
          select: { date: true, fromAmount: true, fromCurrency: true },
        }),
        this.prisma.accountTransfer.findMany({
          where: { toAccountId: accountId, isDeleted: false, countAsIncome: false, date: { gte: startDate, lte: today } },
          select: { date: true, toAmount: true, toCurrency: true },
        }),
      ]);

    // Current balance per currency
    const currentBalances: Record<string, number> = {};
    const currencies: string[] = [];
    for (const s of currentSummary.balances) {
      currentBalances[s.currencyCode] = s.currentBalance;
      currencies.push(s.currencyCode);
    }

    if (currencies.length === 0) {
      return { points: [], currencies: [] };
    }

    // Build daily delta map: dateStr -> currency -> net delta
    const dailyDeltas = new Map<string, Map<string, number>>();

    const addDelta = (date: Date, currency: string, delta: number) => {
      const dateStr = date.toISOString().split('T')[0];
      if (!dailyDeltas.has(dateStr)) dailyDeltas.set(dateStr, new Map());
      const dayMap = dailyDeltas.get(dateStr)!;
      dayMap.set(currency, (dayMap.get(currency) ?? 0) + delta);
    };

    for (const r of incomes) addDelta(r.date, r.currencyCode, Number(r.amount));
    for (const r of expenses) addDelta(r.date, r.currencyCode, -Number(r.amount));
    for (const r of exchanges) {
      addDelta(r.date, r.fromCurrency, -Number(r.fromAmount));
      addDelta(r.date, r.toCurrency, Number(r.toAmount));
    }
    for (const r of transfersOut) addDelta(r.date, r.fromCurrency, -Number(r.fromAmount));
    for (const r of transfersIn) addDelta(r.date, r.toCurrency, Number(r.toAmount));

    // Total delta in the range per currency
    const rangeDelta: Record<string, number> = {};
    for (const dayMap of dailyDeltas.values()) {
      for (const [currency, delta] of dayMap) {
        rangeDelta[currency] = (rangeDelta[currency] ?? 0) + delta;
      }
    }

    // Starting balance = current balance minus everything that happened in the window
    const running: Record<string, number> = {};
    for (const currency of currencies) {
      running[currency] = (currentBalances[currency] ?? 0) - (rangeDelta[currency] ?? 0);
    }

    // Walk day-by-day and emit points
    const points: { date: string; balances: Record<string, number> }[] = [];
    for (let i = 0; i <= cappedDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const dayMap = dailyDeltas.get(dateStr);
      if (dayMap) {
        for (const [currency, delta] of dayMap) {
          running[currency] = (running[currency] ?? 0) + delta;
        }
      }

      points.push({ date: dateStr, balances: { ...running } });
    }

    return { points, currencies };
  }

  async getMonthlyBalanceHistory(accountId: string, months: number) {
    const cappedMonths = Math.min(Math.max(1, months), 12);

    const now = new Date();
    // First day of the earliest month in the window (UTC)
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (cappedMonths - 1), 1, 0, 0, 0, 0),
    );
    // Last day of the current month (UTC)
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    const [incomes, expenses, exchanges, transfersOut, transfersIn] = await Promise.all([
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, amount: true, currencyCode: true },
      }),
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, amount: true, currencyCode: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, fromAmount: true, toAmount: true, fromCurrency: true, toCurrency: true },
      }),
      this.prisma.accountTransfer.findMany({
        where: { fromAccountId: accountId, isDeleted: false, date: { gte: start, lte: end } },
        select: { date: true, fromAmount: true, fromCurrency: true },
      }),
      this.prisma.accountTransfer.findMany({
        where: { toAccountId: accountId, isDeleted: false, countAsIncome: false, date: { gte: start, lte: end } },
        select: { date: true, toAmount: true, toCurrency: true },
      }),
    ]);

    const monthKey = (date: Date): string =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    // monthKey -> currency -> net delta
    const monthMap = new Map<string, Map<string, number>>();
    const currencySet = new Set<string>();
    const add = (date: Date, currency: string, delta: number) => {
      const key = monthKey(new Date(date));
      if (!monthMap.has(key)) monthMap.set(key, new Map());
      const m = monthMap.get(key)!;
      m.set(currency, (m.get(currency) ?? 0) + delta);
      currencySet.add(currency);
    };

    for (const r of incomes) add(r.date, r.currencyCode, Number(r.amount));
    for (const r of expenses) add(r.date, r.currencyCode, -Number(r.amount));
    for (const r of exchanges) {
      add(r.date, r.fromCurrency, -Number(r.fromAmount));
      add(r.date, r.toCurrency, Number(r.toAmount));
    }
    for (const r of transfersOut) add(r.date, r.fromCurrency, -Number(r.fromAmount));
    for (const r of transfersIn) add(r.date, r.toCurrency, Number(r.toAmount));

    // Emit one entry per month in the window, chronological, including empty months
    const result: { month: string; deltas: Record<string, number> }[] = [];
    for (let i = 0; i < cappedMonths; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const key = monthKey(d);
      const m = monthMap.get(key);
      const deltas: Record<string, number> = {};
      if (m) for (const [c, v] of m) deltas[c] = v;
      result.push({ month: key, deltas });
    }

    return { months: result, currencies: Array.from(currencySet) };
  }
}
