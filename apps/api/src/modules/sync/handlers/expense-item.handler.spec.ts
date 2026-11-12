import { Logger } from '@nestjs/common';
import { processExpenseItemChange } from './expense-item.handler';
import { SyncHandlerContext } from '../sync-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  expense: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  expenseItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  category: { findFirst: jest.fn() },
  child: { findFirst: jest.fn() },
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

  it('creates a new item and NEVER contributes to the community prices (ABA-642: only a signed scan token can)', async () => {
    mockPrisma.expenseItem.findFirst.mockResolvedValue(null);
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
    expect(mockCommunityPrices.recordContribution).not.toHaveBeenCalled();
    // The parent expense's updatedAt is bumped (account-scoped) so the public changes feed re-delivers it.
    expect(mockPrisma.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp-1', accountId: 'acc-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('an item update with a canonicalName never re-votes either (an edit must not rewrite a price)', async () => {
    mockPrisma.expenseItem.findFirst.mockResolvedValue({ id: 'item-1', syncVersion: 1 });
    mockPrisma.expenseItem.update.mockResolvedValue({
      id: 'item-1',
      expenseId: 'exp-1',
      canonicalName: 'Milk 1L',
      syncVersion: 2,
    });

    const result = await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
      entityType: 'expense_item',
      entityId: 'item-1',
      operation: 'update',
      clientVersion: 1,
      accountId: 'acc-1',
      payload: { expenseId: 'exp-1', description: 'Milk', canonicalName: 'Milk 1L', totalPrice: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result.status).toBe('success');
    expect(mockCommunityPrices.recordContribution).not.toHaveBeenCalled();
  });

  it('does not contribute when canonicalName is absent', async () => {
    mockPrisma.expenseItem.findFirst.mockResolvedValue(null);
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
    mockPrisma.expenseItem.findFirst.mockResolvedValue({ id: 'item-1', syncVersion: 3 });

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

  it('soft-deletes an item and bumps the parent expense from the stored row, not the payload', async () => {
    mockPrisma.expenseItem.findFirst.mockResolvedValue({ id: 'item-1', expenseId: 'exp-stored', syncVersion: 1 });
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
    expect(mockPrisma.expense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp-stored', accountId: 'acc-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it.each(['update', 'delete'] as const)(
    'treats an item id outside the account as missing on %s — no write, no serverData',
    async (operation) => {
      // The scoped lookup finds nothing for another account's item.
      mockPrisma.expenseItem.findFirst.mockResolvedValue(null);

      const result = await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
        entityType: 'expense_item',
        entityId: 'foreign-item',
        operation,
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', description: 'Milk', totalPrice: 5 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      expect(result).toEqual({ entityId: 'foreign-item', status: 'error', error: 'Entity not found' });
      expect(result).not.toHaveProperty('serverData');
      expect(mockPrisma.expenseItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.expenseItem.findFirst).toHaveBeenCalledWith({
        where: { id: 'foreign-item', expense: { accountId: 'acc-1' } },
      });
    },
  );
  describe('childId (child costs)', () => {
    const upd = (payload: Record<string, unknown>) =>
      processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
        entityType: 'expense_item',
        entityId: 'item-1',
        operation: 'update',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', description: 'Milk', totalPrice: 5, ...payload },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    beforeEach(() => {
      mockPrisma.expenseItem.findFirst.mockResolvedValue({ id: 'item-1', expenseId: 'exp-1', syncVersion: 1 });
      mockPrisma.expenseItem.update.mockResolvedValue({ id: 'item-1', syncVersion: 2 });
    });

    it('expense_item childId null clears, absent leaves', async () => {
      await upd({ childId: null });
      expect(mockPrisma.expenseItem.update.mock.calls[0][0].data.childId).toBeNull();
      expect(mockPrisma.child.findFirst).not.toHaveBeenCalled();

      await upd({});
      expect(mockPrisma.expenseItem.update.mock.calls[1][0].data.childId).toBeUndefined();
    });

    it('resolves a client childId to the server PK, scoped to the account', async () => {
      mockPrisma.child.findFirst.mockResolvedValue({ id: 'child-pk' });
      await upd({ childId: 'child-local' });
      expect(mockPrisma.child.findFirst).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', isDeleted: false, OR: [{ id: 'child-local' }, { clientId: 'child-local' }] },
        select: { id: true },
      });
      expect(mockPrisma.expenseItem.update.mock.calls[0][0].data.childId).toBe('child-pk');
    });

    it('an unresolvable childId leaves the column alone on update and is null on create', async () => {
      mockPrisma.child.findFirst.mockResolvedValue(null);
      await upd({ childId: 'ghost' });
      expect(mockPrisma.expenseItem.update.mock.calls[0][0].data.childId).toBeUndefined();

      mockPrisma.expenseItem.findFirst.mockResolvedValue(null);
      mockPrisma.expenseItem.create.mockResolvedValue({ id: 'item-2', expenseId: 'exp-1', syncVersion: 0 });
      await processExpenseItemChange(makeCtx(), 'acc-1', 'user-1', {
        entityType: 'expense_item',
        entityId: 'item-2',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', description: 'Milk', totalPrice: 5, childId: 'ghost' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect(mockPrisma.expenseItem.create.mock.calls[0][0].data.childId).toBeNull();
    });
  });
});
