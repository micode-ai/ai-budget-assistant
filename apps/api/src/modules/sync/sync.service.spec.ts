import { Test } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../../database/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  tripExpenseShare: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  expense: {
    findFirst: jest.fn(),
  },
  accountMember: {
    findFirst: jest.fn(),
  },
  shoppingList: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  shoppingListItem: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tag: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  expenseTag: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
};

const mockExpensesService = {
  getByClientId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockIncomesService = {
  getByClientId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('SyncService', () => {
  let service: SyncService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ExpensesService, useValue: mockExpensesService },
        { provide: IncomesService, useValue: mockIncomesService },
      ],
    }).compile();
    service = module.get(SyncService);
    prisma = mockPrisma;
    jest.clearAllMocks();
  });

  describe('processChange — tripExpenseShare', () => {
    beforeEach(() => {
      // Default happy path: expense belongs to the account and the target user is a member.
      prisma.expense.findFirst = jest.fn().mockResolvedValue({ id: 'exp-1', accountId: 'acc-1' });
      prisma.accountMember.findFirst = jest.fn().mockResolvedValue({ id: 'member-1', accountId: 'acc-1', userId: 'bob' });
    });

    it('creates a TripExpenseShare row', async () => {
      prisma.tripExpenseShare.upsert = jest.fn().mockResolvedValue({ id: 'share-1' });
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tripExpenseShare',
        entityId: 'share-client-1',
        operation: 'create',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', userId: 'bob', shareType: 'equal', shareAmount: 30 },
      });
      expect(result.status).toBe('success');
      expect(prisma.tripExpenseShare.upsert).toHaveBeenCalled();
    });

    it('updates a TripExpenseShare row', async () => {
      prisma.tripExpenseShare.upsert = jest.fn().mockResolvedValue({ id: 'share-1', syncVersion: 2 });
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tripExpenseShare',
        entityId: 'share-client-1',
        operation: 'update',
        clientVersion: 2,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', userId: 'bob', shareType: 'exact', shareAmount: 45 },
      });
      expect(result.status).toBe('success');
      expect(prisma.tripExpenseShare.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expenseId_userId: { expenseId: 'exp-1', userId: 'bob' } },
        }),
      );
    });

    it('deletes a TripExpenseShare row scoped by expenseId + userId', async () => {
      prisma.tripExpenseShare.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tripExpenseShare',
        entityId: 'share-client-1',
        operation: 'delete',
        clientVersion: 2,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', userId: 'bob', shareType: 'equal', shareAmount: 30 },
      });
      expect(result.status).toBe('success');
      expect(prisma.tripExpenseShare.deleteMany).toHaveBeenCalledWith({
        where: { expenseId: 'exp-1', userId: 'bob' },
      });
    });

    it('returns an error result when the upsert throws', async () => {
      prisma.tripExpenseShare.upsert = jest.fn().mockRejectedValue(new Error('db down'));
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tripExpenseShare',
        entityId: 'share-client-1',
        operation: 'create',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', userId: 'bob', shareType: 'equal', shareAmount: 30 },
      });
      expect(result.status).toBe('error');
      expect(result.error).toBe('db down');
    });

    it('rejects when the expense belongs to a different account (IDOR guard)', async () => {
      // The expense exists, but not scoped to this account — findFirst({ id, accountId }) finds nothing.
      prisma.expense.findFirst = jest.fn().mockResolvedValue(null);
      prisma.tripExpenseShare.upsert = jest.fn();
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tripExpenseShare',
        entityId: 'share-client-1',
        operation: 'create',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-from-other-account', userId: 'bob', shareType: 'equal', shareAmount: 30 },
      });
      expect(result.status).toBe('error');
      expect(prisma.tripExpenseShare.upsert).not.toHaveBeenCalled();
    });

    it('rejects when the target userId is not a member of the account', async () => {
      prisma.accountMember.findFirst = jest.fn().mockResolvedValue(null);
      prisma.tripExpenseShare.upsert = jest.fn();
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tripExpenseShare',
        entityId: 'share-client-1',
        operation: 'create',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { expenseId: 'exp-1', userId: 'not-a-member', shareType: 'equal', shareAmount: 30 },
      });
      expect(result.status).toBe('error');
      expect(prisma.tripExpenseShare.upsert).not.toHaveBeenCalled();
    });
  });

  describe('processChange — shopping list', () => {
    it('processChange upserts a shopping_list on create', async () => {
      prisma.shoppingList.upsert.mockResolvedValue({ id: 'srv-1', syncVersion: 0 });
      const res = await (service as any).processChange('a1', 'u1', {
        entityType: 'shopping_list', operation: 'create', entityId: 'cli-1', clientVersion: 0, accountId: 'a1',
        payload: { name: 'Weekly', localId: 'cli-1' },
      });
      expect(res.status).toBe('success');
      expect(res.serverId).toBe('srv-1');
    });

    it('processChange resolves the item parent list by clientId', async () => {
      prisma.shoppingList.findFirst.mockResolvedValue({ id: 'srv-list', accountId: 'a1' });
      prisma.shoppingListItem.upsert.mockResolvedValue({ id: 'srv-item', syncVersion: 0 });
      const res = await (service as any).processChange('a1', 'u1', {
        entityType: 'shopping_list_item', operation: 'create', entityId: 'ci-1', clientVersion: 0, accountId: 'a1',
        payload: { shoppingListId: 'cli-list', rawLabel: 'Milk', localId: 'ci-1' },
      });
      expect(prisma.shoppingList.findFirst).toHaveBeenCalled();
      expect(prisma.shoppingListItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ shoppingListId: 'srv-list' }) }),
      );
      expect(res.status).toBe('success');
    });

    it('shopping_list_item create returns error when the parent list is not found', async () => {
      prisma.shoppingList.findFirst.mockResolvedValue(null);
      const res = await (service as any).processChange('a1', 'u1', {
        entityType: 'shopping_list_item', operation: 'create', entityId: 'ci-x', clientVersion: 0, accountId: 'a1',
        payload: { shoppingListId: 'missing', rawLabel: 'Milk', localId: 'ci-x' },
      });
      expect(res.status).toBe('error');
      expect(prisma.shoppingListItem.upsert).not.toHaveBeenCalled();
    });
  });

  describe('processChange — expense (highest-volume handler)', () => {
    it('creates a new expense when none exists locally', async () => {
      mockExpensesService.getByClientId.mockResolvedValue(null);
      mockExpensesService.create.mockResolvedValue({ expense: { id: 'srv-exp-1', syncVersion: 1 } });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense',
        entityId: 'client-exp-1',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { amount: 42, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({
        entityId: 'client-exp-1',
        status: 'success',
        serverId: 'srv-exp-1',
        serverVersion: 1,
      });
      expect(mockExpensesService.create).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        expect.objectContaining({ localId: 'client-exp-1', amount: 42 }),
      );
    });

    it('updates an existing expense when the client version matches', async () => {
      mockExpensesService.getByClientId.mockResolvedValue({ id: 'srv-exp-1', syncVersion: 2 });
      mockExpensesService.update.mockResolvedValue({ syncVersion: 3 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense',
        entityId: 'client-exp-1',
        operation: 'update',
        clientVersion: 2,
        accountId: 'acc-1',
        payload: { amount: 50, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({ entityId: 'client-exp-1', status: 'success', serverVersion: 3 });
      expect(mockExpensesService.update).toHaveBeenCalledWith('acc-1', 'srv-exp-1', expect.any(Object));
    });

    it('soft-deletes an existing expense', async () => {
      mockExpensesService.getByClientId.mockResolvedValue({ id: 'srv-exp-1', syncVersion: 2 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense',
        entityId: 'client-exp-1',
        operation: 'delete',
        clientVersion: 2,
        accountId: 'acc-1',
        payload: { amount: 42, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({ entityId: 'client-exp-1', status: 'success' });
      expect(mockExpensesService.remove).toHaveBeenCalledWith('acc-1', 'srv-exp-1');
    });

    it('returns status:conflict with serverData when the server version has moved ahead', async () => {
      const serverRow = { id: 'srv-exp-1', syncVersion: 5 };
      mockExpensesService.getByClientId.mockResolvedValue(serverRow);

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense',
        entityId: 'client-exp-1',
        operation: 'update',
        clientVersion: 3, // client is behind — someone else already pushed a newer version
        accountId: 'acc-1',
        payload: { amount: 42, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({
        entityId: 'client-exp-1',
        status: 'conflict',
        serverVersion: 5,
        serverData: serverRow,
      });
      expect(mockExpensesService.update).not.toHaveBeenCalled();
    });

    it('errors when updating an expense that does not exist server-side', async () => {
      mockExpensesService.getByClientId.mockResolvedValue(null);

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense',
        entityId: 'client-exp-1',
        operation: 'update',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { amount: 42, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({ entityId: 'client-exp-1', status: 'error', error: 'Entity not found' });
    });
  });

  describe('processChange — income (highest-volume handler)', () => {
    it('creates a new income when none exists locally', async () => {
      mockIncomesService.getByClientId.mockResolvedValue(null);
      mockIncomesService.create.mockResolvedValue({ id: 'srv-inc-1', syncVersion: 1 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'income',
        entityId: 'client-inc-1',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { amount: 1000, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({
        entityId: 'client-inc-1',
        status: 'success',
        serverId: 'srv-inc-1',
        serverVersion: 1,
      });
      expect(mockIncomesService.create).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        expect.objectContaining({ localId: 'client-inc-1', amount: 1000 }),
      );
    });

    it('updates an existing income when the client version matches', async () => {
      mockIncomesService.getByClientId.mockResolvedValue({ id: 'srv-inc-1', syncVersion: 1 });
      mockIncomesService.update.mockResolvedValue({ syncVersion: 2 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'income',
        entityId: 'client-inc-1',
        operation: 'update',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { amount: 1200, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({ entityId: 'client-inc-1', status: 'success', serverVersion: 2 });
      expect(mockIncomesService.update).toHaveBeenCalledWith('acc-1', 'srv-inc-1', expect.any(Object));
    });

    it('soft-deletes an existing income', async () => {
      mockIncomesService.getByClientId.mockResolvedValue({ id: 'srv-inc-1', syncVersion: 1 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'income',
        entityId: 'client-inc-1',
        operation: 'delete',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { amount: 1000, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({ entityId: 'client-inc-1', status: 'success' });
      expect(mockIncomesService.remove).toHaveBeenCalledWith('acc-1', 'srv-inc-1');
    });

    it('returns status:conflict with serverData when the client is stale', async () => {
      const serverRow = { id: 'srv-inc-1', syncVersion: 9 };
      mockIncomesService.getByClientId.mockResolvedValue(serverRow);

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'income',
        entityId: 'client-inc-1',
        operation: 'update',
        clientVersion: 1,
        accountId: 'acc-1',
        payload: { amount: 1000, currencyCode: 'PLN', date: '2026-07-01' },
      });

      expect(result).toEqual({
        entityId: 'client-inc-1',
        status: 'conflict',
        serverVersion: 9,
        serverData: serverRow,
      });
      expect(mockIncomesService.update).not.toHaveBeenCalled();
    });
  });

  describe('processChange — tag', () => {
    it('upserts a tag scoped to (accountId, name) on create', async () => {
      prisma.tag.upsert.mockResolvedValue({ id: 'srv-tag-1', syncVersion: 1 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tag',
        entityId: 'client-tag-1',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { name: 'Groceries' },
      });

      expect(result).toEqual({
        entityId: 'client-tag-1',
        status: 'success',
        serverId: 'srv-tag-1',
        serverVersion: 1,
      });
      expect(prisma.tag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId_name: { accountId: 'acc-1', name: 'Groceries' } } }),
      );
    });

    it('updates an existing tag looked up scoped to the account', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: 'srv-tag-1' });
      prisma.tag.update.mockResolvedValue({ syncVersion: 2 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tag',
        entityId: 'srv-tag-1',
        operation: 'update',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { name: 'Groceries & Household' },
      });

      expect(result).toEqual({ entityId: 'srv-tag-1', status: 'success', serverVersion: 2 });
      expect(prisma.tag.findFirst).toHaveBeenCalledWith({ where: { id: 'srv-tag-1', accountId: 'acc-1' } });
    });

    it('errors updating a tag that does not belong to this account', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tag',
        entityId: 'other-accounts-tag',
        operation: 'update',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { name: 'Hijack attempt' },
      });

      expect(result).toEqual({ entityId: 'other-accounts-tag', status: 'error', error: 'Tag not found' });
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });

    it('soft-deletes a tag scoped to the account', async () => {
      prisma.tag.updateMany.mockResolvedValue({ count: 1 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'tag',
        entityId: 'srv-tag-1',
        operation: 'delete',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { name: 'Groceries' },
      });

      expect(result).toEqual({ entityId: 'srv-tag-1', status: 'success' });
      expect(prisma.tag.updateMany).toHaveBeenCalledWith({
        where: { id: 'srv-tag-1', accountId: 'acc-1' },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
    });
  });

  describe('processChange — budget/category (unsupported sync-queue entities)', () => {
    // Budgets and categories are deliberately NOT sync-queue entities — the
    // mobile app manages both exclusively through their own REST CRUD
    // endpoints and never emits 'budget'/'category' SyncChange entries
    // through this push path. processBudgetChange/processCategoryChange used
    // to silently return status:'success' without writing anything, which
    // would have marked a future such change synced on the client while the
    // server discarded it. They now fail loudly instead — pinning that
    // behavior here means a future attempt to route budget/category writes
    // through this handler gets an explicit error, not a false success.
    it('returns an error for a budget change without calling into Prisma', async () => {
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'budget',
        entityId: 'client-budget-1',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: {},
      });

      expect(result.entityId).toBe('client-budget-1');
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/not supported/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns an error for a category change without calling into Prisma', async () => {
      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'category',
        entityId: 'client-category-1',
        operation: 'update',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: {},
      });

      expect(result.entityId).toBe('client-category-1');
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/not supported/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('processChange — expense_tag relation (ABA-167 clientId resolution)', () => {
    // Regression coverage: mobile tags/expenses resolve their local clientId
    // to a server PK before the relation change is pushed, so the junction
    // upsert must use the (already-resolved) expenseId/tagId in the payload
    // verbatim — not the SyncChange's own entityId.
    it('upserts the expense_tag junction using the ids from the payload', async () => {
      prisma.expenseTag.upsert.mockResolvedValue({ id: 'et-1' });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense_tag',
        entityId: 'client-et-1',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { expenseId: 'srv-exp-1', tagId: 'srv-tag-1' },
      });

      expect(result).toEqual({ entityId: 'client-et-1', status: 'success' });
      expect(prisma.expenseTag.upsert).toHaveBeenCalledWith({
        where: { expenseId_tagId: { expenseId: 'srv-exp-1', tagId: 'srv-tag-1' } },
        create: { expenseId: 'srv-exp-1', tagId: 'srv-tag-1' },
        update: { isDeleted: false },
      });
    });

    it('soft-deletes the expense_tag row by its own id, not by expenseId/tagId', async () => {
      prisma.expenseTag.updateMany.mockResolvedValue({ count: 1 });

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense_tag',
        entityId: 'srv-et-1',
        operation: 'delete',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { expenseId: 'srv-exp-1', tagId: 'srv-tag-1' },
      });

      expect(result).toEqual({ entityId: 'srv-et-1', status: 'success' });
      expect(prisma.expenseTag.updateMany).toHaveBeenCalledWith({
        where: { id: 'srv-et-1' },
        data: { isDeleted: true },
      });
    });

    it('returns a status:error result instead of throwing when the upsert fails', async () => {
      prisma.expenseTag.upsert.mockRejectedValue(new Error('constraint violation'));

      const result = await (service as any).processChange('acc-1', 'user-1', {
        entityType: 'expense_tag',
        entityId: 'client-et-1',
        operation: 'create',
        clientVersion: 0,
        accountId: 'acc-1',
        payload: { expenseId: 'srv-exp-1', tagId: 'srv-tag-1' },
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('constraint violation');
    });
  });

  describe('pushChanges', () => {
    it('stamps the user lastSyncAt after processing the batch', async () => {
      prisma.user.update.mockResolvedValue({});

      await service.pushChanges('acc-1', 'user-1', []);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastSyncAt: expect.any(Date) },
      });
    });

    it('converts a handler exception into a status:error result rather than rejecting the batch', async () => {
      mockExpensesService.getByClientId.mockRejectedValue(new Error('db down'));
      prisma.user.update.mockResolvedValue({});

      const results = await service.pushChanges('acc-1', 'user-1', [
        {
          entityType: 'expense',
          entityId: 'client-exp-1',
          operation: 'create',
          clientVersion: 0,
          accountId: 'acc-1',
          payload: { amount: 42, currencyCode: 'PLN', date: '2026-07-01' },
        } as any,
      ]);

      expect(results).toEqual([{ entityId: 'client-exp-1', status: 'error', error: 'db down' }]);
    });
  });
});
