import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import { accountCurrencyKey, buildWalletBalanceRow } from './wallet-balance.util';
import { resolveWalletCurrencies } from '../../common/utils/wallet-currencies';
import { WalletCurrencyService } from './wallet-currency.service';
import { SetWalletBalanceDto } from './dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so the display still works without it — persisting a derived
    // currency row is best-effort housekeeping, never a precondition for
    // showing the user their money.
    @Optional() private readonly walletCurrency?: WalletCurrencyService,
  ) {}

  async setBalance(accountId: string, userId: string, dto: SetWalletBalanceDto) {
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
        clientId: dto.localId ?? randomUUID(),
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

  async getSummary(accountId: string, userId?: string) {
    // Deleted rows are fetched too: a soft-deleted row means the user hid that
    // currency, and resolveWalletCurrencies needs to see it to keep it hidden
    // rather than re-derive it from the movements.
    const walletBalances = await this.prisma.walletBalance.findMany({
      where: { accountId },
    });

    // Get income totals grouped by currency
    const incomeTotals = await this.prisma.income.groupBy({
      by: ['currencyCode'],
      where: { accountId, isDeleted: false },
      _sum: { amount: true },
    });

    // Get expense totals grouped by currency
    // isSplitReceivable: false excludes the debt rows a receipt split creates —
    // that money already left as the original receipt expense. See
    // common/utils/expense-filters.ts for the full accounting rationale.
    const expenseTotals = await this.prisma.expense.groupBy({
      by: ['currencyCode'],
      where: { accountId, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE },
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

    // A currency the account holds money in must show up even when nobody ever
    // set an initial balance for it (ABA-431) — in this path the totals maps are
    // keyed by the currency itself.
    const resolved = resolveWalletCurrencies(
      walletBalances.map((wb: typeof walletBalances[number]) => ({
        currencyCode: wb.currencyCode,
        isDeleted: wb.isDeleted,
        initialAmount: Number(wb.initialAmount),
      })),
      [
        ...incomeMap.keys(),
        ...expenseMap.keys(),
        ...exchangeInMap.keys(),
        ...exchangeOutMap.keys(),
        ...transferInMap.keys(),
        ...transferOutMap.keys(),
      ],
    );

    this.persistDerivedCurrencies(accountId, userId, resolved);

    const balances = resolved.map((r) =>
      buildWalletBalanceRow(r.currencyCode, r.initialAmount, {
        totalIncomes: incomeMap.get(r.currencyCode) || 0,
        totalExpenses: expenseMap.get(r.currencyCode) || 0,
        totalExchangedIn: exchangeInMap.get(r.currencyCode) || 0,
        totalExchangedOut: exchangeOutMap.get(r.currencyCode) || 0,
        totalTransferredIn: transferInMap.get(r.currencyCode) || 0,
        totalTransferredOut: transferOutMap.get(r.currencyCode) || 0,
      }),
    );

    return { balances };
  }

  /**
   * Fire-and-forget: turn the currencies we had to derive into real
   * `wallet_balances` rows so the next read finds them, and so every other
   * consumer of that table (mobile's local mirror included) sees them too.
   */
  private persistDerivedCurrencies(
    accountId: string,
    userId: string | undefined,
    resolved: { currencyCode: string; derived: boolean }[],
  ): void {
    const derived = resolved.filter((r) => r.derived).map((r) => r.currencyCode);
    if (derived.length === 0) return;
    void this.walletCurrency?.ensureCurrencies(accountId, userId, derived).catch(() => {});
  }

  /**
   * Wallet balances for every account the user belongs to, in one round trip.
   *
   * Mirrors `getSummary` exactly — same six aggregates, same exclusions — but grouped
   * by `accountId + currencyCode` so the transfer form can show the balance of an
   * account other than the selected one. Six queries total regardless of how many
   * accounts the user has, rather than six per account.
   */
  async getSummariesForAccounts(userId: string) {
    const memberships = await this.prisma.accountMember.findMany({
      where: { userId },
      select: { accountId: true },
    });
    const accountIds = memberships.map((m: { accountId: string }) => m.accountId);
    if (accountIds.length === 0) return { accounts: [] };

    const [
      walletBalances,
      incomeTotals,
      expenseTotals,
      exchangeOut,
      exchangeIn,
      transfersOut,
      transfersIn,
    ] = await Promise.all([
      this.prisma.walletBalance.findMany({
        // Deleted rows included on purpose — see getSummary.
        where: { accountId: { in: accountIds } },
      }),
      this.prisma.income.groupBy({
        by: ['accountId', 'currencyCode'],
        where: { accountId: { in: accountIds }, isDeleted: false },
        _sum: { amount: true },
      }),
      // isSplitReceivable: false — see common/utils/expense-filters.ts.
      this.prisma.expense.groupBy({
        by: ['accountId', 'currencyCode'],
        where: { accountId: { in: accountIds }, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE },
        _sum: { amount: true },
      }),
      this.prisma.currencyExchange.groupBy({
        by: ['accountId', 'fromCurrency'],
        where: { accountId: { in: accountIds }, isDeleted: false },
        _sum: { fromAmount: true },
      }),
      this.prisma.currencyExchange.groupBy({
        by: ['accountId', 'toCurrency'],
        where: { accountId: { in: accountIds }, isDeleted: false },
        _sum: { toAmount: true },
      }),
      this.prisma.accountTransfer.groupBy({
        by: ['fromAccountId', 'fromCurrency'],
        where: { fromAccountId: { in: accountIds }, isDeleted: false },
        _sum: { fromAmount: true },
      }),
      // countAsIncome transfers are already counted through their linked Income row.
      this.prisma.accountTransfer.groupBy({
        by: ['toAccountId', 'toCurrency'],
        where: { toAccountId: { in: accountIds }, isDeleted: false, countAsIncome: false },
        _sum: { toAmount: true },
      }),
    ]);

    // Every money source below goes through toMap, so recording the movement
    // here is what keeps the "which currencies does this account actually hold"
    // set complete without each call site having to remember (ABA-431).
    const movementsByAccount = new Map<string, Set<string>>();
    const toMap = <T>(
      rows: T[],
      accountOf: (row: T) => string,
      currencyOf: (row: T) => string,
      amountOf: (row: T) => unknown,
    ) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        const accountId = accountOf(row);
        const currencyCode = currencyOf(row);
        map.set(accountCurrencyKey(accountId, currencyCode), Number(amountOf(row) || 0));
        const seen = movementsByAccount.get(accountId) ?? new Set<string>();
        seen.add(currencyCode);
        movementsByAccount.set(accountId, seen);
      }
      return map;
    };

    type Grouped = Record<string, unknown> & { _sum: Record<string, unknown> };
    const incomeMap = toMap(
      incomeTotals as unknown as Grouped[],
      (r) => r.accountId as string,
      (r) => r.currencyCode as string,
      (r) => r._sum.amount,
    );
    const expenseMap = toMap(
      expenseTotals as unknown as Grouped[],
      (r) => r.accountId as string,
      (r) => r.currencyCode as string,
      (r) => r._sum.amount,
    );
    const exchangeOutMap = toMap(
      exchangeOut as unknown as Grouped[],
      (r) => r.accountId as string,
      (r) => r.fromCurrency as string,
      (r) => r._sum.fromAmount,
    );
    const exchangeInMap = toMap(
      exchangeIn as unknown as Grouped[],
      (r) => r.accountId as string,
      (r) => r.toCurrency as string,
      (r) => r._sum.toAmount,
    );
    const transferOutMap = toMap(
      transfersOut as unknown as Grouped[],
      (r) => r.fromAccountId as string,
      (r) => r.fromCurrency as string,
      (r) => r._sum.fromAmount,
    );
    const transferInMap = toMap(
      transfersIn as unknown as Grouped[],
      (r) => r.toAccountId as string,
      (r) => r.toCurrency as string,
      (r) => r._sum.toAmount,
    );

    const rowsByAccount = new Map<
      string,
      { currencyCode: string; isDeleted: boolean; initialAmount: number }[]
    >();
    for (const wb of walletBalances) {
      const rows = rowsByAccount.get(wb.accountId) ?? [];
      rows.push({
        currencyCode: wb.currencyCode,
        isDeleted: wb.isDeleted,
        initialAmount: Number(wb.initialAmount),
      });
      rowsByAccount.set(wb.accountId, rows);
    }

    const byAccount = new Map<string, ReturnType<typeof buildWalletBalanceRow>[]>();
    for (const accountId of accountIds) {
      const resolved = resolveWalletCurrencies(
        rowsByAccount.get(accountId) ?? [],
        movementsByAccount.get(accountId) ?? [],
      );
      this.persistDerivedCurrencies(accountId, userId, resolved);

      byAccount.set(
        accountId,
        resolved.map((r) => {
          const key = accountCurrencyKey(accountId, r.currencyCode);
          return buildWalletBalanceRow(r.currencyCode, r.initialAmount, {
            totalIncomes: incomeMap.get(key) || 0,
            totalExpenses: expenseMap.get(key) || 0,
            totalExchangedIn: exchangeInMap.get(key) || 0,
            totalExchangedOut: exchangeOutMap.get(key) || 0,
            totalTransferredIn: transferInMap.get(key) || 0,
            totalTransferredOut: transferOutMap.get(key) || 0,
          });
        }),
      );
    }

    return {
      accounts: accountIds.map((accountId) => ({
        accountId,
        balances: byAccount.get(accountId) ?? [],
      })),
    };
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
          // isSplitReceivable: false — see common/utils/expense-filters.ts.
          where: { accountId, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: { gte: startDate, lte: today } },
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
        // isSplitReceivable: false — see common/utils/expense-filters.ts.
        where: { accountId, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: { gte: start, lte: end } },
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
