import { NetWorthService } from './net-worth.service';
import { closeOnOrBefore, convertViaEur, debtRemainingAt, monthEnds, quantityAt } from './net-worth.util';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const utcDay = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

describe('net-worth.util (ABA-799)', () => {
  it('lists the last month-ends oldest first, with now as the current month', () => {
    const ends = monthEnds(d(2026, 11, 16), 3);
    expect(ends.map((e) => [e.month, e.current])).toEqual([['2026-09', false], ['2026-10', false], ['2026-11', true]]);
    expect(ends[0].at).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });

  it('counts a debt from its date and takes off repayments made by then', () => {
    const debts = [{ id: 'a', amount: 500, currencyCode: 'PLN', date: d(2026, 9, 5) }];
    const repay = [{ debtId: 'a', amount: 200, date: d(2026, 10, 3) }, { debtId: 'a', amount: 400, date: d(2026, 11, 1) }];
    expect(debtRemainingAt(debts, repay, d(2026, 9, 1)).get('PLN')).toBeUndefined();
    expect(debtRemainingAt(debts, repay, d(2026, 9, 30)).get('PLN')).toBe(500);
    expect(debtRemainingAt(debts, repay, d(2026, 10, 31)).get('PLN')).toBe(300);
    expect(debtRemainingAt(debts, repay, d(2026, 11, 2)).get('PLN')).toBeUndefined(); // over-repaid: never negative
  });

  it('rebuilds holdings from trades, or from the creation day without any', () => {
    const trades = [
      { type: 'buy', quantity: 10, date: d(2026, 5, 1) },
      { type: 'sell', quantity: 4, date: d(2026, 8, 1) },
    ];
    expect(quantityAt({ quantity: 6, createdAt: d(2026, 5, 1) }, trades, d(2026, 4, 30))).toBe(0);
    expect(quantityAt({ quantity: 6, createdAt: d(2026, 5, 1) }, trades, d(2026, 6, 30))).toBe(10);
    expect(quantityAt({ quantity: 6, createdAt: d(2026, 5, 1) }, trades, d(2026, 9, 30))).toBe(6);
    expect(quantityAt({ quantity: 3, createdAt: d(2026, 7, 10) }, [], d(2026, 6, 30))).toBe(0);
    expect(quantityAt({ quantity: 3, createdAt: d(2026, 7, 10) }, [], d(2026, 7, 31))).toBe(3);
  });

  it('takes the last close on or before a date', () => {
    const prices = [{ date: d(2026, 9, 28), close: 10 }, { date: d(2026, 9, 30), close: 11 }, { date: d(2026, 10, 2), close: 12 }];
    expect(closeOnOrBefore(prices, d(2026, 10, 1))).toBe(11);
    expect(closeOnOrBefore(prices, d(2026, 9, 1))).toBeNull();
  });

  it('converts through EUR rates', () => {
    expect(convertViaEur(100, 'EUR', 'PLN', { PLN: 4.3 })).toBeCloseTo(430);
    expect(convertViaEur(430, 'PLN', 'USD', { PLN: 4.3, USD: 1.1 })).toBeCloseTo(110);
    expect(convertViaEur(1, 'XYZ', 'PLN', { PLN: 4.3 })).toBeNull();
  });
});

describe('NetWorthService (ABA-799)', () => {
  const NOW = new Date(2026, 10, 16, 12);

  function make(o: {
    accounts?: { id: string; name: string; type: string; encryptionTier?: number }[];
    balances?: { accountId: string; currencyCode: string; currentBalance: number }[];
    incomes?: unknown[];
    expenses?: unknown[];
    lent?: unknown[];
    lentRepay?: unknown[];
    holdings?: unknown[];
    trades?: unknown[];
    prices?: unknown[];
  }) {
    const accounts = o.accounts ?? [{ id: 'a1', name: 'Main', type: 'personal' }];
    const byAccount = new Map<string, { currencyCode: string; currentBalance: number }[]>();
    for (const b of o.balances ?? []) byAccount.set(b.accountId, [...(byAccount.get(b.accountId) ?? []), b]);
    const prisma: any = {
      accountMember: { findMany: jest.fn().mockResolvedValue(accounts.map((account) => ({ account }))) },
      income: {
        findMany: jest.fn(async ({ where }: any) =>
          where.isDebt ? [] : where.isDebtRepayment ? o.lentRepay ?? [] : o.incomes ?? [],
        ),
      },
      expense: {
        findMany: jest.fn(async ({ where }: any) =>
          where.isDebt ? o.lent ?? [] : where.isDebtRepayment ? [] : o.expenses ?? [],
        ),
      },
      currencyExchange: { findMany: jest.fn().mockResolvedValue([]) },
      accountTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      walletAdjustment: { findMany: jest.fn().mockResolvedValue([]) },
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(o.holdings ?? []) },
      investmentTransaction: { findMany: jest.fn().mockResolvedValue(o.trades ?? []) },
      assetPriceHistory: { findMany: jest.fn().mockResolvedValue(o.prices ?? []) },
    };
    const wallet: any = {
      getSummariesForAccounts: jest.fn().mockResolvedValue({
        accounts: accounts.map((a) => ({ accountId: a.id, balances: byAccount.get(a.id) ?? [] })),
      }),
    };
    const fx: any = { getRates: jest.fn().mockResolvedValue({ rates: { PLN: 1, USD: 0.25 } }) };
    const cache: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    return { service: new NetWorthService(prisma, wallet, fx, cache), prisma };
  }

  it('walks the wallet back month by month from today', async () => {
    const { service } = make({
      balances: [{ accountId: 'a1', currencyCode: 'PLN', currentBalance: 1000 }],
      incomes: [{ accountId: 'a1', currencyCode: 'PLN', amount: '600', date: utcDay(2026, 11, 10) }],
      expenses: [{ accountId: 'a1', currencyCode: 'PLN', amount: '100', date: utcDay(2026, 10, 20) }],
    });
    const res = await service.compute('u1', 'PLN', [], NOW);
    expect(res.current.cash).toBe(1000);
    const oct = res.history.find((h) => h.month === '2026-10')!;
    const sep = res.history.find((h) => h.month === '2026-09')!;
    expect(oct.cash).toBe(400); // before November's 600 income
    expect(sep.cash).toBe(500); // and before October's 100 expense
    expect(res.history).toHaveLength(12);
  });

  it('adds investments and money owed, and subtracts debts', async () => {
    const { service } = make({
      balances: [{ accountId: 'a1', currencyCode: 'PLN', currentBalance: 1000 }],
      lent: [{ id: 'l1', accountId: 'a1', amount: '300', currencyCode: 'PLN', date: utcDay(2026, 9, 1) }],
      lentRepay: [{ relatedDebtExpenseId: 'l1', amount: '100', date: utcDay(2026, 11, 1) }],
      holdings: [
        {
          id: 'h1', accountId: 'a1', assetId: 's1', quantity: '2', averageCostBasis: '90',
          createdAt: d(2026, 1, 1), asset: { currentPrice: '100', priceCurrency: 'USD' },
        },
      ],
      trades: [{ holdingId: 'h1', type: 'buy', quantity: '2', date: d(2026, 6, 1) }],
      prices: [{ assetId: 's1', date: d(2026, 9, 30), closePrice: '80' }],
    });
    const res = await service.compute('u1', 'PLN', [], NOW);
    expect(res.current.investments).toBe(800); // 2 × 100 USD at 0.25
    expect(res.current.owedToMe).toBe(200);
    expect(res.current.net).toBe(1000 + 800 + 200);
    const sep = res.history.find((h) => h.month === '2026-09')!;
    expect(sep.investments).toBe(640); // 2 × 80 USD, September's close
    expect(sep.owedToMe).toBe(300);
    const may = res.history.find((h) => h.month === '2026-05')!;
    expect(may.investments).toBe(0); // bought in June
  });

  it('lists excluded and encrypted accounts without summing them', async () => {
    const { service } = make({
      accounts: [
        { id: 'a1', name: 'Main', type: 'personal' },
        { id: 'a2', name: 'Family', type: 'shared' },
        { id: 'a3', name: 'Secret', type: 'personal', encryptionTier: 2 },
      ],
      balances: [
        { accountId: 'a1', currencyCode: 'PLN', currentBalance: 100 },
        { accountId: 'a2', currencyCode: 'PLN', currentBalance: 5000 },
        { accountId: 'a3', currencyCode: 'PLN', currentBalance: 7000 },
      ],
    });
    const res = await service.compute('u1', 'PLN', ['a2'], NOW);
    expect(res.current.net).toBe(100);
    expect(res.accounts.map((a) => [a.id, a.included, a.encrypted, a.net])).toEqual([
      ['a1', true, false, 100],
      ['a2', false, false, null],
      ['a3', true, true, null],
    ]);
  });
});
