import { Logger } from '@nestjs/common';
import { processPortfolioHoldingChange } from './portfolio-holding.handler';
import { SyncHandlerContext } from '../sync-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  asset: { findFirst: jest.fn(), create: jest.fn() },
  portfolioHolding: { upsert: jest.fn(), updateMany: jest.fn() },
};

function makeCtx(): SyncHandlerContext {
  return {
    prisma: mockPrisma,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expensesService: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incomesService: {} as any,
    logger: new Logger('test'),
  };
}

describe('processPortfolioHoldingChange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reuses an existing asset by symbol+exchange instead of creating a duplicate', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    mockPrisma.portfolioHolding.upsert.mockResolvedValue({ id: 'holding-1', syncVersion: 0 });

    const result = await processPortfolioHoldingChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'portfolio_holding',
      entityId: 'client-holding-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { assetSymbol: 'aapl', assetName: 'Apple', assetType: 'stock', localId: 'client-holding-1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'client-holding-1', status: 'success', serverId: 'holding-1', serverVersion: 0 });
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith({ where: { symbol: 'AAPL', exchange: null } });
  });

  it('creates a new asset when none exists for the symbol', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    mockPrisma.asset.create.mockResolvedValue({ id: 'asset-2' });
    mockPrisma.portfolioHolding.upsert.mockResolvedValue({ id: 'holding-2', syncVersion: 0 });

    await processPortfolioHoldingChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'portfolio_holding',
      entityId: 'client-holding-2',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { assetSymbol: 'tsla', assetName: 'Tesla', assetType: 'stock', localId: 'client-holding-2' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(mockPrisma.asset.create).toHaveBeenCalled();
  });

  it('soft-deletes a holding scoped by clientId + account', async () => {
    mockPrisma.portfolioHolding.updateMany.mockResolvedValue({ count: 1 });

    const result = await processPortfolioHoldingChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'portfolio_holding',
      entityId: 'client-holding-1',
      operation: 'delete',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'client-holding-1', status: 'success' });
    expect(mockPrisma.portfolioHolding.updateMany).toHaveBeenCalledWith({
      where: { clientId: 'client-holding-1', accountId: 'acc-1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
  });
});
