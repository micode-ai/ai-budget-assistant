import { Logger } from '@nestjs/common';
import { processInvestmentTransactionChange } from './investment-transaction.handler';
import { SyncHandlerContext } from '../sync-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  portfolioHolding: { findFirst: jest.fn() },
  investmentTransaction: { upsert: jest.fn(), updateMany: jest.fn() },
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

describe('processInvestmentTransactionChange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('errors when the referenced holding is not found', async () => {
    mockPrisma.portfolioHolding.findFirst.mockResolvedValue(null);

    const result = await processInvestmentTransactionChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'investment_transaction',
      entityId: 'client-tx-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { holdingId: 'missing-holding', type: 'buy', quantity: 1, pricePerUnit: 10, date: '2026-07-01' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'client-tx-1', status: 'error', error: 'Holding not found' });
    expect(mockPrisma.investmentTransaction.upsert).not.toHaveBeenCalled();
  });

  it('adds the fee to totalAmount on a buy', async () => {
    mockPrisma.portfolioHolding.findFirst.mockResolvedValue({ id: 'holding-1' });
    mockPrisma.investmentTransaction.upsert.mockResolvedValue({ id: 'tx-1', syncVersion: 0 });

    await processInvestmentTransactionChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'investment_transaction',
      entityId: 'client-tx-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { holdingId: 'holding-1', type: 'buy', quantity: 2, pricePerUnit: 10, fee: 1, date: '2026-07-01' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(mockPrisma.investmentTransaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ totalAmount: 21 }) }),
    );
  });

  it('subtracts the fee from totalAmount on a sell', async () => {
    mockPrisma.portfolioHolding.findFirst.mockResolvedValue({ id: 'holding-1' });
    mockPrisma.investmentTransaction.upsert.mockResolvedValue({ id: 'tx-1', syncVersion: 0 });

    await processInvestmentTransactionChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'investment_transaction',
      entityId: 'client-tx-2',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { holdingId: 'holding-1', type: 'sell', quantity: 2, pricePerUnit: 10, fee: 1, date: '2026-07-01' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(mockPrisma.investmentTransaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ totalAmount: 19 }) }),
    );
  });

  it('soft-deletes a transaction scoped by clientId + account', async () => {
    mockPrisma.investmentTransaction.updateMany.mockResolvedValue({ count: 1 });

    const result = await processInvestmentTransactionChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'investment_transaction',
      entityId: 'client-tx-1',
      operation: 'delete',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'client-tx-1', status: 'success' });
    expect(mockPrisma.investmentTransaction.updateMany).toHaveBeenCalledWith({
      where: { clientId: 'client-tx-1', accountId: 'acc-1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
  });
});
