import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvestmentsService } from './investments.service';

function makePrisma(overrides: any = {}) {
  return {
    portfolioHolding: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides.portfolioHolding,
    },
    investmentTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue(undefined),
      ...overrides.investmentTransaction,
    },
    asset: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides.asset,
    },
    assetPriceHistory: {
      upsert: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.assetPriceHistory,
    },
    $transaction: jest.fn().mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(),
    ),
    ...overrides.rest,
  };
}

function makeTwelveData(overrides: any = {}) {
  return {
    searchAssets: jest.fn().mockResolvedValue([]),
    getCurrentPrice: jest.fn().mockResolvedValue(null),
    getBatchPrices: jest.fn().mockResolvedValue(new Map()),
    getTimeSeries: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('InvestmentsService.createTransaction — delta-based holding recalculation', () => {
  const holdingId = 'h-1';
  const baseHolding = {
    id: holdingId,
    accountId: 'acc-1',
    quantity: 0,
    totalInvested: 0,
    averageCostBasis: 0,
  };

  it('buy: adds quantity, invested amount, and fee; recomputes average cost basis', async () => {
    const prisma = makePrisma({
      portfolioHolding: { findFirst: jest.fn().mockResolvedValue({ ...baseHolding }) },
      investmentTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'tx-1', ...data })),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    const tx = await service.createTransaction('acc-1', 'u1', {
      localId: 'local-1',
      holdingId,
      type: 'buy',
      quantity: 10,
      pricePerUnit: 100,
      fee: 5,
      date: '2026-01-01',
    } as any);

    expect(tx.totalAmount).toBe(1005); // 10*100 + fee
    expect(prisma.portfolioHolding.update).toHaveBeenCalledWith({
      where: { id: holdingId },
      data: {
        quantity: 10,
        averageCostBasis: 100.5, // 1005 / 10
        totalInvested: 1005,
        syncVersion: { increment: 1 },
      },
    });
  });

  it('sell: reduces quantity and proportionally reduces invested amount, keeping average cost basis flat', async () => {
    const prisma = makePrisma({
      portfolioHolding: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseHolding,
          quantity: 10,
          totalInvested: 1005,
          averageCostBasis: 100.5,
        }),
      },
      investmentTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'tx-2', ...data })),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    const tx = await service.createTransaction('acc-1', 'u1', {
      localId: 'local-2',
      holdingId,
      type: 'sell',
      quantity: 5,
      pricePerUnit: 150,
      fee: 0,
      date: '2026-01-02',
    } as any);

    expect(tx.totalAmount).toBe(750); // 5*150, no fee subtracted (fee 0)
    expect(prisma.portfolioHolding.update).toHaveBeenCalledWith({
      where: { id: holdingId },
      data: {
        quantity: 5,
        averageCostBasis: 100.5, // unchanged — proportional reduction
        totalInvested: 502.5, // 1005 - 5*100.5
        syncVersion: { increment: 1 },
      },
    });
  });

  it('rejects a sell that exceeds the current holding quantity', async () => {
    const prisma = makePrisma({
      portfolioHolding: {
        findFirst: jest.fn().mockResolvedValue({ ...baseHolding, quantity: 3 }),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    await expect(
      service.createTransaction('acc-1', 'u1', {
        localId: 'local-3',
        holdingId,
        type: 'sell',
        quantity: 5,
        pricePerUnit: 10,
        date: '2026-01-03',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the holding does not exist', async () => {
    const prisma = makePrisma();
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    await expect(
      service.createTransaction('acc-1', 'u1', {
        localId: 'local-4',
        holdingId: 'missing',
        type: 'buy',
        quantity: 1,
        pricePerUnit: 1,
        date: '2026-01-04',
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('is idempotent on a resent clientId — recalculates but does not create a duplicate transaction', async () => {
    const existingTx = { id: 'tx-existing' };
    const create = jest.fn();
    const prisma = makePrisma({
      portfolioHolding: { findFirst: jest.fn().mockResolvedValue({ ...baseHolding, quantity: 10 }) },
      investmentTransaction: {
        findFirst: jest.fn().mockResolvedValue(existingTx),
        findMany: jest.fn().mockResolvedValue([]),
        create,
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    const result = await service.createTransaction('acc-1', 'u1', {
      localId: 'already-synced',
      holdingId,
      type: 'buy',
      quantity: 1,
      pricePerUnit: 1,
      date: '2026-01-05',
    } as any);

    expect(result).toBe(existingTx);
    expect(create).not.toHaveBeenCalled();
    // still recalculates from scratch as a safety net
    expect(prisma.investmentTransaction.findMany).toHaveBeenCalled();
    expect(prisma.portfolioHolding.update).toHaveBeenCalled();
  });
});

describe('InvestmentsService — recalculateHolding via updateTransaction/removeTransaction', () => {
  const holdingId = 'h-2';

  it('recomputes quantity/avgCost/totalInvested from the full buy+sell history', async () => {
    const transactions = [
      { type: 'buy', quantity: 10, pricePerUnit: 100, fee: 5 }, // invested 1005, qty 10
      { type: 'buy', quantity: 10, pricePerUnit: 200, fee: 0 }, // invested +2000=3005, qty 20
      { type: 'sell', quantity: 5, pricePerUnit: 250, fee: 0 }, // avgCost 150.25, invested -751.25=2253.75, qty 15
    ];
    const prisma = makePrisma({
      investmentTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tx-1',
          holdingId,
          accountId: 'acc-1',
          type: 'buy',
          quantity: 1,
          pricePerUnit: 1,
          fee: 0,
        }),
        findMany: jest.fn().mockResolvedValue(transactions),
        update: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    await service.updateTransaction('acc-1', 'tx-1', { quantity: 1 } as any);

    expect(prisma.portfolioHolding.update).toHaveBeenCalledWith({
      where: { id: holdingId },
      data: {
        quantity: 15,
        averageCostBasis: 150.25,
        totalInvested: 2253.75,
        syncVersion: { increment: 1 },
      },
    });
  });

  it('removeTransaction soft-deletes and recalculates back to zero when it was the only buy', async () => {
    const prisma = makePrisma({
      investmentTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tx-1', holdingId, accountId: 'acc-1' }),
        update: jest.fn().mockResolvedValue({ id: 'tx-1' }),
        findMany: jest.fn().mockResolvedValue([]), // the removed tx is excluded (isDeleted filter)
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    await service.removeTransaction('acc-1', 'tx-1');

    expect(prisma.investmentTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    expect(prisma.portfolioHolding.update).toHaveBeenCalledWith({
      where: { id: holdingId },
      data: {
        quantity: 0,
        averageCostBasis: 0,
        totalInvested: 0,
        syncVersion: { increment: 1 },
      },
    });
  });
});

describe('InvestmentsService.createHolding / removeHolding', () => {
  it('creates a new asset + holding when none exists', async () => {
    const created = { id: 'holding-new' };
    const prisma = makePrisma({
      asset: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'asset-1' }) },
      portfolioHolding: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    });
    const twelveData = makeTwelveData({ getCurrentPrice: jest.fn().mockResolvedValue(123.45) });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    const result = await service.createHolding('acc-1', 'u1', {
      localId: 'local-1',
      assetSymbol: 'aapl',
      assetName: 'Apple',
      assetType: 'stock',
    } as any);

    expect(result).toBe(created);
    expect(prisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ symbol: 'AAPL', currentPrice: 123.45 }) }),
    );
  });

  it('rejects creating a holding that already exists (not soft-deleted)', async () => {
    const prisma = makePrisma({
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'asset-1', priceCurrency: 'USD' }) },
      portfolioHolding: {
        findUnique: jest.fn().mockResolvedValue({ id: 'holding-1', isDeleted: false }),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    await expect(
      service.createHolding('acc-1', 'u1', {
        localId: 'local-1',
        assetSymbol: 'AAPL',
        assetName: 'Apple',
        assetType: 'stock',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('reactivates a soft-deleted holding instead of creating a duplicate', async () => {
    const reactivated = { id: 'holding-1', isDeleted: false };
    const prisma = makePrisma({
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'asset-1', priceCurrency: 'USD' }) },
      portfolioHolding: {
        findUnique: jest.fn().mockResolvedValue({ id: 'holding-1', isDeleted: true }),
        update: jest.fn().mockResolvedValue(reactivated),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    const result = await service.createHolding('acc-1', 'u1', {
      localId: 'local-1',
      assetSymbol: 'AAPL',
      assetName: 'Apple',
      assetType: 'stock',
    } as any);

    expect(result).toBe(reactivated);
    expect(prisma.portfolioHolding.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'holding-1' }, data: expect.objectContaining({ isDeleted: false }) }),
    );
  });

  it('removeHolding soft-deletes the holding and all its transactions, zeroing aggregates', async () => {
    const prisma = makePrisma({
      portfolioHolding: {
        findFirst: jest.fn().mockResolvedValue({ id: 'holding-1', accountId: 'acc-1', isDeleted: false }),
      },
    });
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    const result = await service.removeHolding('acc-1', 'holding-1');

    expect(result).toEqual({ success: true });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('throws NotFoundException when removing a holding that does not exist', async () => {
    const prisma = makePrisma();
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    await expect(service.removeHolding('acc-1', 'missing')).rejects.toThrow(NotFoundException);
  });
});

describe('InvestmentsService.refreshPrices', () => {
  it('does nothing when the account has no holdings', async () => {
    const prisma = makePrisma();
    const twelveData = makeTwelveData();
    const service = new InvestmentsService(prisma as any, twelveData as any);

    const result = await service.refreshPrices('acc-1');

    expect(result).toEqual({ success: true });
    expect(twelveData.getBatchPrices).not.toHaveBeenCalled();
  });

  it('batch-updates asset.currentPrice for every holding with a resolved price', async () => {
    const holdings = [
      { asset: { id: 'asset-1', symbol: 'AAPL', exchange: 'NASDAQ', priceCurrency: 'USD' } },
      { asset: { id: 'asset-2', symbol: 'MSFT', exchange: 'NASDAQ', priceCurrency: 'USD' } },
    ];
    const prisma = makePrisma({
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(holdings) },
    });
    const twelveData = makeTwelveData({
      getBatchPrices: jest.fn().mockResolvedValue(
        new Map([
          ['AAPL:NASDAQ', 150],
          ['MSFT:NASDAQ', 300],
        ]),
      ),
    });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    const result = await service.refreshPrices('acc-1');

    expect(result).toEqual({ success: true });
    expect(prisma.asset.update).toHaveBeenCalledTimes(2);
    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'asset-1' }, data: expect.objectContaining({ currentPrice: 150 }) }),
    );
    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'asset-2' }, data: expect.objectContaining({ currentPrice: 300 }) }),
    );
  });

  it('skips assets for which no price was resolved', async () => {
    const holdings = [{ asset: { id: 'asset-1', symbol: 'AAPL', exchange: 'NASDAQ', priceCurrency: 'USD' } }];
    const prisma = makePrisma({
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(holdings) },
    });
    const twelveData = makeTwelveData({ getBatchPrices: jest.fn().mockResolvedValue(new Map()) });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    await service.refreshPrices('acc-1');

    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('corrects a defaulted USD priceCurrency for non-US exchanges using a searchAssets match', async () => {
    const holdings = [
      { asset: { id: 'asset-1', symbol: 'SAP', exchange: 'XETRA', priceCurrency: 'USD' } },
    ];
    const prisma = makePrisma({
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(holdings) },
    });
    const twelveData = makeTwelveData({
      searchAssets: jest.fn().mockResolvedValue([
        { symbol: 'SAP', exchange: 'XETRA', currency: 'EUR' },
      ]),
      getBatchPrices: jest.fn().mockResolvedValue(new Map()),
    });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    await service.refreshPrices('acc-1');

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: { priceCurrency: 'EUR' },
    });
  });
});

describe('InvestmentsService.getPortfolioAnalytics', () => {
  it('returns empty performance series and allocation when there are no holdings', async () => {
    const prisma = makePrisma();
    const service = new InvestmentsService(prisma as any, makeTwelveData() as any);

    const result = await service.getPortfolioAnalytics('acc-1', { period: 'month' } as any);

    expect(result.performance.dates).toEqual([]);
    expect(result.performance.values).toEqual([]);
    expect(result.allocation).toEqual([]);
    expect(result.topGainers).toEqual([]);
    expect(result.topLosers).toEqual([]);
  });

  it('builds a performance series from the time-series price history and computes P&L / allocation', async () => {
    const holdings = [
      {
        quantity: 10,
        totalInvested: 1000,
        averageCostBasis: 100,
        asset: { id: 'asset-1', symbol: 'AAPL', exchange: undefined, type: 'stock', currentPrice: 150 },
      },
    ];
    const prisma = makePrisma({
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(holdings) },
    });
    const twelveData = makeTwelveData({
      getTimeSeries: jest.fn().mockResolvedValue([
        { date: '2026-01-01', open: 100, high: 105, low: 95, close: 100, volume: 1000 },
        { date: '2026-01-02', open: 100, high: 155, low: 95, close: 150, volume: 1200 },
      ]),
    });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    const result = await service.getPortfolioAnalytics('acc-1', { period: 'month' } as any);

    expect(result.performance.dates).toEqual(['2026-01-01', '2026-01-02']);
    expect(result.performance.values).toEqual([1000, 1500]); // qty(10) * close
    expect(result.performance.investedValues).toEqual([1000, 1000]);
    expect(result.allocation).toEqual([{ assetType: 'stock', value: 1500, percentage: 100 }]);
    // pnlPercent = (150-100)/100 * 100 = 50%
    expect(result.topGainers).toEqual([{ symbol: 'AAPL', pnlPercent: 50 }]);
    expect(result.topLosers).toEqual([]);
    expect(prisma.assetPriceHistory.upsert).toHaveBeenCalledTimes(2);
  });

  it('falls back to cached DB price history when Twelve Data returns nothing', async () => {
    const holdings = [
      {
        quantity: 5,
        totalInvested: 500,
        averageCostBasis: 100,
        asset: { id: 'asset-1', symbol: 'MSFT', exchange: undefined, type: 'stock', currentPrice: 100 },
      },
    ];
    const cachedRow = {
      date: new Date('2026-01-01T00:00:00.000Z'),
      openPrice: 100,
      highPrice: 110,
      lowPrice: 90,
      closePrice: 100,
      volume: 500,
    };
    const prisma = makePrisma({
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(holdings) },
      assetPriceHistory: { findMany: jest.fn().mockResolvedValue([cachedRow]) },
    });
    const twelveData = makeTwelveData({ getTimeSeries: jest.fn().mockResolvedValue([]) });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    const result = await service.getPortfolioAnalytics('acc-1', { period: 'month' } as any);

    expect(result.performance.dates).toEqual(['2026-01-01']);
    expect(result.performance.values).toEqual([500]); // 5 * 100
  });

  it('computes benchmarkValues as a percentage return series relative to the last close', async () => {
    const holdings = [
      {
        quantity: 1,
        totalInvested: 100,
        averageCostBasis: 100,
        asset: { id: 'asset-1', symbol: 'AAPL', exchange: undefined, type: 'stock', currentPrice: 100 },
      },
    ];
    const prisma = makePrisma({
      portfolioHolding: { findMany: jest.fn().mockResolvedValue(holdings) },
    });
    const twelveData = makeTwelveData({
      getTimeSeries: jest.fn().mockImplementation((symbol: string) => {
        if (symbol === 'SPY') {
          // API returns most-recent-first; basePrice picked from the LAST array element
          return Promise.resolve([
            { date: '2026-01-02', open: 1, high: 1, low: 1, close: 110, volume: 1 },
            { date: '2026-01-01', open: 1, high: 1, low: 1, close: 100, volume: 1 },
          ]);
        }
        return Promise.resolve([]);
      }),
    });
    const service = new InvestmentsService(prisma as any, twelveData as any);

    const result = await service.getPortfolioAnalytics('acc-1', {
      period: 'month',
      benchmark: 'SPY',
    } as any);

    expect(result.performance.benchmarkName).toBe('SPY');
    // basePrice = last element's close = 100; reversed → [100, 110] → [(100/100-1)*100, (110/100-1)*100]
    expect(result.performance.benchmarkValues).toEqual([0, 10]);
  });
});
