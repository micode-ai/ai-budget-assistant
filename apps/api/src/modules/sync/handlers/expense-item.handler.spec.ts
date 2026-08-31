import { Logger } from '@nestjs/common';
import { processExpenseItemChange } from './expense-item.handler';
import { SyncHandlerContext } from '../sync-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  expense: { findFirst: jest.fn() },
  expenseItem: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  category: { findFirst: jest.fn() },
};

const mockCommunityPrices = { recordContribution: jest.fn().mockResolvedValue(undefined) };

function makeCtx(): SyncHandlerContext {
  return {
    prisma: mockPrisma,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expensesService: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incomesService: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    communityPrices: mockCommunityPrices as any,
    logger: new Logger('test'),
  };
}

describe('processExpenseItemChange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.expense.findFirst.mockResolvedValue({ id: 'exp-1', accountId: 'acc-1' });
  });

  it('rejects when the parent expense does not belong to this account', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue(null);

    const result = await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'expense_item',
      entityId: 'item-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-from-other-account', description: 'Milk', totalPrice: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'item-1', status: 'error', error: 'Parent expense not found' });
    expect(mockPrisma.expenseItem.create).not.toHaveBeenCalled();
  });

  it('creates a new item and fires the community-price contribution when canonicalName is set', async () => {
    mockPrisma.expenseItem.findUnique.mockResolvedValue(null);
    mockPrisma.expenseItem.create.mockResolvedValue({
      id: 'item-1',
      expenseId: 'exp-1',
      canonicalName: 'Milk 1L',
      syncVersion: 0,
    });

    const result = await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'expense_item',
      entityId: 'item-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-1', description: 'Milk', canonicalName: 'Milk 1L', totalPrice: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'item-1', status: 'success', serverId: 'item-1', serverVersion: 0 });
    expect(mockCommunityPrices.recordContribution).toHaveBeenCalledWith('acc-1', 'user-1', 'exp-1');
  });

  it('does not fire the community-price contribution when canonicalName is absent', async () => {
    mockPrisma.expenseItem.findUnique.mockResolvedValue(null);
    mockPrisma.expenseItem.create.mockResolvedValue({
      id: 'item-1',
      expenseId: 'exp-1',
      canonicalName: null,
      syncVersion: 0,
    });

    await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'expense_item',
      entityId: 'item-1',
      operation: 'create',
      clientVersion: 0,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-1', description: 'Milk', totalPrice: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(mockCommunityPrices.recordContribution).not.toHaveBeenCalled();
  });

  it('returns conflict when the client version is behind on update', async () => {
    mockPrisma.expenseItem.findUnique.mockResolvedValue({ id: 'item-1', syncVersion: 3 });

    const result = await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'expense_item',
      entityId: 'item-1',
      operation: 'update',
      clientVersion: 1,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-1', description: 'Milk', totalPrice: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result.status).toBe('conflict');
    expect(mockPrisma.expenseItem.update).not.toHaveBeenCalled();
  });

  it('soft-deletes an item', async () => {
    mockPrisma.expenseItem.findUnique.mockResolvedValue({ id: 'item-1', syncVersion: 1 });
    mockPrisma.expenseItem.update.mockResolvedValue({});

    const result = await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'expense_item',
      entityId: 'item-1',
      operation: 'delete',
      clientVersion: 1,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-1', description: 'Milk', totalPrice: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result).toEqual({ entityId: 'item-1', status: 'success' });
    expect(mockPrisma.expenseItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
  });
});
