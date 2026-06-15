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
