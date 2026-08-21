import { NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('WalletService.getMonthlyBalanceHistory', () => {
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

  function makeService() {
    const prisma = {
      income: { findMany: jest.fn().mockResolvedValue([{ date: thisMonth, amount: 100, currencyCode: 'PLN' }]) },
      expense: { findMany: jest.fn().mockResolvedValue([{ date: lastMonth, amount: 30, currencyCode: 'PLN' }]) },
      currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
      accountTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return new WalletService(prisma as never);
  }

  it('buckets net deltas per month and returns one entry per month in the window', async () => {
    const res = await makeService().getMonthlyBalanceHistory('a1', 3);
    expect(res.months).toHaveLength(3);
    // chronological: last entry is the current month
    expect(res.months[res.months.length - 1].month).toBe(monthKey(thisMonth));
    expect(res.months[res.months.length - 1].deltas.PLN).toBe(100);
    const prev = res.months.find((m) => m.month === monthKey(lastMonth));
    expect(prev?.deltas.PLN).toBe(-30);
    expect(res.currencies).toEqual(['PLN']);
  });

  it('clamps the window to at most 12 months', async () => {
    const res = await makeService().getMonthlyBalanceHistory('a1', 24);
    expect(res.months).toHaveLength(12);
  });
});

describe('WalletService.getSummary', () => {
  function makeService(data: {
    walletBalances?: unknown[];
    incomeTotals?: unknown[];
    expenseTotals?: unknown[];
    exchangeOut?: unknown[];
    exchangeIn?: unknown[];
    transfersOut?: unknown[];
    transfersIn?: unknown[];
  }) {
    const prisma = {
      walletBalance: { findMany: jest.fn().mockResolvedValue(data.walletBalances ?? []) },
      income: { groupBy: jest.fn().mockResolvedValue(data.incomeTotals ?? []) },
      expense: { groupBy: jest.fn().mockResolvedValue(data.expenseTotals ?? []) },
      currencyExchange: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce(data.exchangeOut ?? [])
          .mockResolvedValueOnce(data.exchangeIn ?? []),
      },
      accountTransfer: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce(data.transfersOut ?? [])
          .mockResolvedValueOnce(data.transfersIn ?? []),
      },
    };
    return new WalletService(prisma as never);
  }

  it('combines initial balance, income and expenses per currency across multiple currencies', async () => {
    const service = makeService({
      walletBalances: [
        { currencyCode: 'PLN', initialAmount: 1000 },
        { currencyCode: 'USD', initialAmount: 200 },
      ],
      incomeTotals: [
        { currencyCode: 'PLN', _sum: { amount: 500 } },
        { currencyCode: 'USD', _sum: { amount: 50 } },
      ],
      expenseTotals: [
        { currencyCode: 'PLN', _sum: { amount: 300 } },
        { currencyCode: 'USD', _sum: { amount: 20 } },
      ],
    });

    const res = await service.getSummary('a1');
    const pln = res.balances.find((b) => b.currencyCode === 'PLN')!;
    const usd = res.balances.find((b) => b.currencyCode === 'USD')!;
    expect(pln.currentBalance).toBe(1200);
    expect(usd.currentBalance).toBe(230);
  });

  it('handles income-only currencies (no expenses recorded)', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 100 }],
      incomeTotals: [{ currencyCode: 'PLN', _sum: { amount: 50 } }],
    });

    const res = await service.getSummary('a1');
    expect(res.balances[0].totalExpenses).toBe(0);
    expect(res.balances[0].currentBalance).toBe(150);
  });

  it('handles expense-only currencies (no income recorded)', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 100 }],
      expenseTotals: [{ currencyCode: 'PLN', _sum: { amount: 40 } }],
    });

    const res = await service.getSummary('a1');
    expect(res.balances[0].totalIncomes).toBe(0);
    expect(res.balances[0].currentBalance).toBe(60);
  });

  it('nets currency exchanges to zero when in and out amounts match for a currency', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 500 }],
      exchangeOut: [{ fromCurrency: 'PLN', _sum: { fromAmount: 200 } }],
      exchangeIn: [{ toCurrency: 'PLN', _sum: { toAmount: 200 } }],
    });

    const res = await service.getSummary('a1');
    expect(res.balances[0].totalExchangedIn).toBe(200);
    expect(res.balances[0].totalExchangedOut).toBe(200);
    expect(res.balances[0].currentBalance).toBe(500);
  });

  it('applies a non-zero net when exchange in/out amounts differ for a currency', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 500 }],
      exchangeOut: [{ fromCurrency: 'PLN', _sum: { fromAmount: 200 } }],
      exchangeIn: [{ toCurrency: 'PLN', _sum: { toAmount: 50 } }],
    });

    const res = await service.getSummary('a1');
    expect(res.balances[0].currentBalance).toBe(350); // 500 - 200 + 50
  });

  it('applies transfers in and out per currency', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 300 }],
      transfersOut: [{ fromCurrency: 'PLN', _sum: { fromAmount: 50 } }],
      transfersIn: [{ toCurrency: 'PLN', _sum: { toAmount: 20 } }],
    });

    const res = await service.getSummary('a1');
    expect(res.balances[0].totalTransferredOut).toBe(50);
    expect(res.balances[0].totalTransferredIn).toBe(20);
    expect(res.balances[0].currentBalance).toBe(270); // 300 - 50 + 20
  });

  it('returns an empty balances array for an account with no wallet balances', async () => {
    const service = makeService({});
    const res = await service.getSummary('a1');
    expect(res.balances).toEqual([]);
  });

  // Regression guard for the wallet double-counting bug: a receipt split's
  // debt rows (isSplitReceivable: true) must be excluded from the wallet's
  // expense total — that money already left as the original receipt expense.
  // But NOT isDebt: for a standalone cash loan the debt row IS the outflow,
  // so filtering on isDebt would wrongly zero out every user's tracked debts.
  // Mirrors the same both-halves assertion in analytics.service.spec.ts,
  // safe-to-spend.service.spec.ts, and budget-alert.service.spec.ts.
  it('excludes split receivables from the expense total but still counts a standalone debt', async () => {
    const service = makeService({});
    await service.getSummary('a1');

    const where = (service as any).prisma.expense.groupBy.mock.calls[0][0].where;
    // The marker the split feature sets — must be filtered out.
    expect(where.isSplitReceivable).toBe(false);
    // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
    // filtering on it would rewrite the numbers of every user tracking debts.
    expect(where.isDebt).toBeUndefined();
  });
});

describe('WalletService.getBalanceHistory', () => {
  // Mirrors the service's own date construction so day-string keys line up
  // regardless of the machine's local timezone.
  function startOfRange(cappedDays: number): Date {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cappedDays);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
  }

  function dayInRange(cappedDays: number, offset: number): Date {
    const d = new Date(startOfRange(cappedDays));
    d.setDate(d.getDate() + offset);
    return d;
  }

  function makeService(data: {
    incomes?: unknown[];
    expenses?: unknown[];
    exchanges?: unknown[];
    transfersOut?: unknown[];
    transfersIn?: unknown[];
    summaryBalances: { currencyCode: string; currentBalance: number }[];
  }) {
    const prisma = {
      income: { findMany: jest.fn().mockResolvedValue(data.incomes ?? []) },
      expense: { findMany: jest.fn().mockResolvedValue(data.expenses ?? []) },
      currencyExchange: { findMany: jest.fn().mockResolvedValue(data.exchanges ?? []) },
      accountTransfer: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(data.transfersOut ?? [])
          .mockResolvedValueOnce(data.transfersIn ?? []),
      },
    };
    const service = new WalletService(prisma as never);
    jest.spyOn(service, 'getSummary').mockResolvedValue({ balances: data.summaryBalances as never });
    return service;
  }

  it('back-calculates the starting balance and walks forward through incomes/expenses', async () => {
    const cappedDays = 5;
    const service = makeService({
      incomes: [{ date: dayInRange(cappedDays, 1), amount: 100, currencyCode: 'PLN' }],
      expenses: [{ date: dayInRange(cappedDays, 3), amount: 40, currencyCode: 'PLN' }],
      summaryBalances: [{ currencyCode: 'PLN', currentBalance: 200 }],
    });

    const res = await service.getBalanceHistory('a1', cappedDays);
    expect(res.currencies).toEqual(['PLN']);
    expect(res.points).toHaveLength(cappedDays + 1);
    // rangeDelta = +100 - 40 = 60; start = 200 - 60 = 140
    expect(res.points[0].balances.PLN).toBe(140);
    expect(res.points[1].balances.PLN).toBe(240); // after the +100 income
    expect(res.points[2].balances.PLN).toBe(240); // unchanged
    expect(res.points[3].balances.PLN).toBe(200); // after the -40 expense
    // last point must reconcile with the current balance from getSummary
    expect(res.points[cappedDays].balances.PLN).toBe(200);
  });

  it('walks multiple currencies through exchanges and transfers independently', async () => {
    const cappedDays = 5;
    const service = makeService({
      exchanges: [
        { date: dayInRange(cappedDays, 2), fromCurrency: 'PLN', fromAmount: 100, toCurrency: 'USD', toAmount: 25 },
      ],
      transfersOut: [{ date: dayInRange(cappedDays, 1), fromCurrency: 'PLN', fromAmount: 30 }],
      transfersIn: [{ date: dayInRange(cappedDays, 3), toCurrency: 'USD', toAmount: 10 }],
      summaryBalances: [
        { currencyCode: 'PLN', currentBalance: 500 },
        { currencyCode: 'USD', currentBalance: 100 },
      ],
    });

    const res = await service.getBalanceHistory('a1', cappedDays);
    expect(res.points[0].balances).toEqual({ PLN: 630, USD: 65 });
    expect(res.points[2].balances).toEqual({ PLN: 500, USD: 90 });
    expect(res.points[cappedDays].balances).toEqual({ PLN: 500, USD: 100 });
  });

  it('clamps the window to at most 90 days', async () => {
    const service = makeService({ summaryBalances: [{ currencyCode: 'PLN', currentBalance: 10 }] });
    const res = await service.getBalanceHistory('a1', 200);
    expect(res.points).toHaveLength(91); // 0..90 inclusive
  });

  it('short-circuits to empty points/currencies when the account has no wallet balances', async () => {
    const service = makeService({ summaryBalances: [] });
    const res = await service.getBalanceHistory('a1', 30);
    expect(res).toEqual({ points: [], currencies: [] });
  });
});

describe('WalletService.setBalance', () => {
  it('upserts the wallet balance keyed by account + currency', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'wb1' });
    const service = new WalletService({ walletBalance: { upsert } } as never);

    await service.setBalance('a1', 'u1', { currencyCode: 'PLN', initialAmount: 250, localId: 'local-1' });

    expect(upsert).toHaveBeenCalledWith({
      where: { accountId_currencyCode: { accountId: 'a1', currencyCode: 'PLN' } },
      update: { initialAmount: 250, isDeleted: false, syncVersion: { increment: 1 } },
      create: {
        accountId: 'a1',
        userId: 'u1',
        clientId: 'local-1',
        currencyCode: 'PLN',
        initialAmount: 250,
      },
    });
  });

  it('generates a clientId when the caller omits localId', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'wb1' });
    const service = new WalletService({ walletBalance: { upsert } } as never);

    await service.setBalance('a1', 'u1', { currencyCode: 'PLN', initialAmount: 250 });

    const call = upsert.mock.calls[0][0];
    expect(typeof call.create.clientId).toBe('string');
    expect(call.create.clientId.length).toBeGreaterThan(0);
  });
});

describe('WalletService.findAll', () => {
  it('lists non-deleted wallet balances ordered by currency code', async () => {
    const findMany = jest.fn().mockResolvedValue([{ currencyCode: 'PLN' }]);
    const service = new WalletService({ walletBalance: { findMany } } as never);

    const res = await service.findAll('a1');

    expect(findMany).toHaveBeenCalledWith({
      where: { accountId: 'a1', isDeleted: false },
      orderBy: { currencyCode: 'asc' },
    });
    expect(res).toEqual([{ currencyCode: 'PLN' }]);
  });
});

describe('WalletService.remove', () => {
  it('throws NotFoundException when the balance does not exist', async () => {
    const prisma = {
      walletBalance: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    const service = new WalletService(prisma as never);

    await expect(service.remove('a1', 'PLN')).rejects.toThrow(NotFoundException);
    expect(prisma.walletBalance.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the balance is already soft-deleted', async () => {
    const prisma = {
      walletBalance: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wb1', isDeleted: true }),
        update: jest.fn(),
      },
    };
    const service = new WalletService(prisma as never);

    await expect(service.remove('a1', 'PLN')).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes the balance and bumps syncVersion', async () => {
    const prisma = {
      walletBalance: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wb1', isDeleted: false }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new WalletService(prisma as never);

    const res = await service.remove('a1', 'PLN');

    expect(prisma.walletBalance.update).toHaveBeenCalledWith({
      where: { id: 'wb1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    expect(res).toEqual({ success: true });
  });
});

describe('WalletService.getSummariesForAccounts', () => {
  function makeService(data: {
    memberships?: unknown[];
    walletBalances?: unknown[];
    incomeTotals?: unknown[];
    expenseTotals?: unknown[];
    exchangeOut?: unknown[];
    exchangeIn?: unknown[];
    transfersOut?: unknown[];
    transfersIn?: unknown[];
  }) {
    const prisma = {
      accountMember: { findMany: jest.fn().mockResolvedValue(data.memberships ?? []) },
      walletBalance: { findMany: jest.fn().mockResolvedValue(data.walletBalances ?? []) },
      income: { groupBy: jest.fn().mockResolvedValue(data.incomeTotals ?? []) },
      expense: { groupBy: jest.fn().mockResolvedValue(data.expenseTotals ?? []) },
      currencyExchange: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce(data.exchangeOut ?? [])
          .mockResolvedValueOnce(data.exchangeIn ?? []),
      },
      accountTransfer: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce(data.transfersOut ?? [])
          .mockResolvedValueOnce(data.transfersIn ?? []),
      },
    };
    return { service: new WalletService(prisma as never), prisma };
  }

  it('returns an empty list and touches nothing else when the user has no accounts', async () => {
    const { service, prisma } = makeService({ memberships: [] });

    await expect(service.getSummariesForAccounts('u1')).resolves.toEqual({ accounts: [] });
    expect(prisma.walletBalance.findMany).not.toHaveBeenCalled();
  });

  it('keeps each account’s totals separate', async () => {
    const { service } = makeService({
      memberships: [{ accountId: 'a1' }, { accountId: 'a2' }],
      walletBalances: [
        { accountId: 'a1', currencyCode: 'PLN', initialAmount: 1000 },
        { accountId: 'a2', currencyCode: 'PLN', initialAmount: 50 },
      ],
      incomeTotals: [{ accountId: 'a1', currencyCode: 'PLN', _sum: { amount: 200 } }],
      expenseTotals: [{ accountId: 'a2', currencyCode: 'PLN', _sum: { amount: 20 } }],
      transfersOut: [{ fromAccountId: 'a1', fromCurrency: 'PLN', _sum: { fromAmount: 300 } }],
      transfersIn: [{ toAccountId: 'a2', toCurrency: 'PLN', _sum: { toAmount: 300 } }],
    });

    const res = await service.getSummariesForAccounts('u1');

    const a1 = res.accounts.find((a) => a.accountId === 'a1');
    const a2 = res.accounts.find((a) => a.accountId === 'a2');
    // a1: 1000 + 200 income - 300 transferred out
    expect(a1?.balances[0].currentBalance).toBe(900);
    // a2: 50 - 20 spent + 300 transferred in
    expect(a2?.balances[0].currentBalance).toBe(330);
  });

  it('does not leak one account’s totals into another account with the same currency', async () => {
    const { service } = makeService({
      memberships: [{ accountId: 'a1' }, { accountId: 'a2' }],
      walletBalances: [
        { accountId: 'a1', currencyCode: 'EUR', initialAmount: 0 },
        { accountId: 'a2', currencyCode: 'EUR', initialAmount: 0 },
      ],
      incomeTotals: [{ accountId: 'a1', currencyCode: 'EUR', _sum: { amount: 500 } }],
    });

    const res = await service.getSummariesForAccounts('u1');

    expect(res.accounts.find((a) => a.accountId === 'a1')?.balances[0].currentBalance).toBe(500);
    expect(res.accounts.find((a) => a.accountId === 'a2')?.balances[0].currentBalance).toBe(0);
  });

  it('lists an account with no wallet balance rows rather than dropping it', async () => {
    const { service } = makeService({
      memberships: [{ accountId: 'a1' }, { accountId: 'empty' }],
      walletBalances: [{ accountId: 'a1', currencyCode: 'PLN', initialAmount: 10 }],
    });

    const res = await service.getSummariesForAccounts('u1');

    expect(res.accounts).toHaveLength(2);
    expect(res.accounts.find((a) => a.accountId === 'empty')?.balances).toEqual([]);
  });

  it('excludes split-receivable expenses and income-counted incoming transfers', async () => {
    const { service, prisma } = makeService({ memberships: [{ accountId: 'a1' }] });

    await service.getSummariesForAccounts('u1');

    expect(prisma.expense.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isSplitReceivable: false }) }),
    );
    // Second accountTransfer.groupBy call is the incoming side.
    expect(prisma.accountTransfer.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ countAsIncome: false }) }),
    );
  });

  it('supports multiple currencies on one account', async () => {
    const { service } = makeService({
      memberships: [{ accountId: 'a1' }],
      walletBalances: [
        { accountId: 'a1', currencyCode: 'PLN', initialAmount: 100 },
        { accountId: 'a1', currencyCode: 'EUR', initialAmount: 40 },
      ],
      expenseTotals: [{ accountId: 'a1', currencyCode: 'EUR', _sum: { amount: 15 } }],
    });

    const res = await service.getSummariesForAccounts('u1');
    const balances = res.accounts[0].balances;

    expect(balances.find((b) => b.currencyCode === 'PLN')?.currentBalance).toBe(100);
    expect(balances.find((b) => b.currencyCode === 'EUR')?.currentBalance).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// ABA-431 — currencies with money but no wallet_balances row
// ---------------------------------------------------------------------------

describe('WalletService currency derivation', () => {
  type Row = { accountId?: string; currencyCode: string; initialAmount: number; isDeleted?: boolean };

  function makeService(opts: {
    walletBalances?: Row[];
    income?: { currencyCode: string; amount: number }[];
    expense?: { currencyCode: string; amount: number }[];
    ensure?: jest.Mock;
  }) {
    const rows = (opts.walletBalances ?? []).map((r) => ({ isDeleted: false, ...r }));
    const groupSum = (
      list: { currencyCode: string; amount: number }[] | undefined,
      field: string,
    ) => (list ?? []).map((r) => ({ [field]: r.currencyCode, _sum: { amount: r.amount } }));

    const prisma = {
      walletBalance: { findMany: jest.fn().mockResolvedValue(rows) },
      income: { groupBy: jest.fn().mockResolvedValue(groupSum(opts.income, 'currencyCode')) },
      expense: { groupBy: jest.fn().mockResolvedValue(groupSum(opts.expense, 'currencyCode')) },
      currencyExchange: { groupBy: jest.fn().mockResolvedValue([]) },
      accountTransfer: { groupBy: jest.fn().mockResolvedValue([]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ accountId: 'a1' }]) },
    };
    const ensure = opts.ensure ?? jest.fn().mockResolvedValue(undefined);
    const service = new WalletService(prisma as never, { ensureCurrencies: ensure } as never);
    return { service, prisma, ensure };
  }

  it('shows a currency that has income but no wallet row, with a balance derived from the movements', async () => {
    const { service } = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 0 }],
      income: [{ currencyCode: 'USD', amount: 126500 }],
      expense: [{ currencyCode: 'USD', amount: 2016 }],
    });

    const res = await service.getSummary('a1');
    const usd = res.balances.find((b) => b.currencyCode === 'USD');

    expect(usd).toBeDefined();
    expect(usd?.initialAmount).toBe(0);
    expect(usd?.currentBalance).toBe(124484);
  });

  it('does not show a currency the user hid from the wallet even though it still has movements', async () => {
    const { service } = makeService({
      walletBalances: [
        { currencyCode: 'PLN', initialAmount: 0 },
        { currencyCode: 'BYN', initialAmount: 0, isDeleted: true },
      ],
      expense: [{ currencyCode: 'BYN', amount: 349 }],
    });

    const res = await service.getSummary('a1');

    expect(res.balances.map((b) => b.currencyCode)).toEqual(['PLN']);
  });

  it('persists only the derived currencies so the rows exist on the next read', async () => {
    const { service, ensure } = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 0 }],
      income: [{ currencyCode: 'USD', amount: 10 }, { currencyCode: 'PLN', amount: 5 }],
    });

    await service.getSummary('a1');

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure.mock.calls[0][2]).toEqual(['USD']);
  });

  it('does not call the persister at all when nothing had to be derived', async () => {
    const { service, ensure } = makeService({
      walletBalances: [{ currencyCode: 'PLN', initialAmount: 0 }],
      income: [{ currencyCode: 'PLN', amount: 5 }],
    });

    await service.getSummary('a1');

    expect(ensure).not.toHaveBeenCalled();
  });

  it('still returns the derived balance when persisting the row fails', async () => {
    const { service } = makeService({
      income: [{ currencyCode: 'USD', amount: 10 }],
      ensure: jest.fn().mockRejectedValue(new Error('db down')),
    });

    const res = await service.getSummary('a1');

    expect(res.balances.map((b) => b.currencyCode)).toEqual(['USD']);
  });

  it('derives the same missing currencies for the multi-account transfer-form summary', async () => {
    const { service } = makeService({
      walletBalances: [{ accountId: 'a1', currencyCode: 'PLN', initialAmount: 0 }],
    });
    // groupBy for the multi-account path keys rows by accountId as well
    (service as unknown as { prisma: { income: { groupBy: jest.Mock } } }).prisma.income.groupBy =
      jest.fn().mockResolvedValue([{ accountId: 'a1', currencyCode: 'USD', _sum: { amount: 700 } }]);

    const res = await service.getSummariesForAccounts('u1');
    const balances = res.accounts[0].balances;

    expect(balances.find((b) => b.currencyCode === 'USD')?.currentBalance).toBe(700);
  });
});
