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
  });
});
