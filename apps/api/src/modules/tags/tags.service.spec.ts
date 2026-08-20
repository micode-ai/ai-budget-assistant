import { NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';

function makeService(overrides: { tag?: Record<string, any> } = {}) {
  const embeddingService: any = {
    embedAndStore: jest.fn().mockResolvedValue(undefined),
  };

  const prisma: any = {
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    expense: {
      findFirst: jest.fn(),
    },
    income: {
      findFirst: jest.fn(),
    },
    expenseTag: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    incomeTag: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  void overrides;
  const service = new TagsService(prisma, embeddingService);
  return { service, prisma, embeddingService };
}

describe('TagsService', () => {
  // -------------------------------------------------------------------------
  // findOne — id-or-clientId resolution (ABA-167)
  // -------------------------------------------------------------------------
  describe('findOne', () => {
    it('resolves a tag by its server PK', async () => {
      const { service, prisma } = makeService();
      const tag = { id: 'tag-1', clientId: null, accountId: 'acc-1' };
      prisma.tag.findFirst.mockResolvedValue(tag);

      const result = await service.findOne('acc-1', 'tag-1');

      expect(result).toBe(tag);
      const where = prisma.tag.findFirst.mock.calls[0][0].where;
      expect(where.accountId).toBe('acc-1');
      expect(where.isDeleted).toBe(false);
      expect(where.OR).toEqual([{ id: 'tag-1' }, { clientId: 'tag-1' }]);
    });

    it('resolves a tag by its mobile clientId when the server id is unknown to the client', async () => {
      const { service, prisma } = makeService();
      const tag = { id: 'server-generated-id', clientId: 'local-uuid-123', accountId: 'acc-1' };
      // Simulate Prisma matching on the clientId branch of the OR.
      prisma.tag.findFirst.mockResolvedValue(tag);

      const result = await service.findOne('acc-1', 'local-uuid-123');

      expect(result.id).toBe('server-generated-id');
      const where = prisma.tag.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ id: 'local-uuid-123' }, { clientId: 'local-uuid-123' }]);
    });

    it('throws NotFoundException when neither id nor clientId matches', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.findOne('acc-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('never matches a soft-deleted tag', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.findOne('acc-1', 'tag-1')).rejects.toThrow(NotFoundException);
      const where = prisma.tag.findFirst.mock.calls[0][0].where;
      expect(where.isDeleted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // create — idempotent upsert on (accountId, name)
  // -------------------------------------------------------------------------
  describe('create', () => {
    it('creates a brand-new tag with usageCount 0 and stores the mobile clientId', async () => {
      const { service, prisma, embeddingService } = makeService();
      const created = { id: 'tag-1', name: 'Groceries', clientId: 'local-1', usageCount: 0 };
      prisma.tag.upsert.mockResolvedValue(created);

      const result = await service.create('acc-1', 'user-1', {
        name: 'Groceries',
        color: '#fff',
        icon: 'cart',
        clientId: 'local-1',
      } as any);

      expect(result).toBe(created);
      const args = prisma.tag.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ accountId_name: { accountId: 'acc-1', name: 'Groceries' } });
      expect(args.create).toMatchObject({
        accountId: 'acc-1',
        name: 'Groceries',
        clientId: 'local-1',
        usageCount: 0,
      });
      expect(embeddingService.embedAndStore).toHaveBeenCalledWith('tag', 'tag-1', 'Groceries');
    });

    it('returns the existing row (does not throw) when a tag with the same name already exists', async () => {
      const { service, prisma } = makeService();
      // Prisma's upsert on a duplicate (accountId, name) resolves to the
      // existing row via the `update` branch instead of throwing P2002.
      const existing = { id: 'tag-existing', name: 'Groceries', clientId: 'new-local-id', usageCount: 4 };
      prisma.tag.upsert.mockResolvedValue(existing);

      const result = await service.create('acc-1', 'user-1', {
        name: 'Groceries',
        clientId: 'new-local-id',
      } as any);

      expect(result).toBe(existing);
      const args = prisma.tag.upsert.mock.calls[0][0];
      // A second device creating the same-named tag should still update the
      // clientId so ITS local id also resolves via findOne later.
      expect(args.update).toEqual({ clientId: 'new-local-id' });
    });

    it('sends an empty update when no clientId is supplied, leaving any existing clientId untouched', async () => {
      const { service, prisma } = makeService();
      prisma.tag.upsert.mockResolvedValue({ id: 'tag-1', name: 'Groceries' });

      await service.create('acc-1', 'user-1', { name: 'Groceries' } as any);

      const args = prisma.tag.upsert.mock.calls[0][0];
      expect(args.update).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // addToExpense / removeFromExpense
  // -------------------------------------------------------------------------
  describe('addToExpense', () => {
    it('resolves the expense by clientId, links the tag, and increments usageCount', async () => {
      const { service, prisma } = makeService();
      const tag = { id: 'tag-1', accountId: 'acc-1' };
      prisma.tag.findFirst.mockResolvedValue(tag);
      prisma.expense.findFirst.mockResolvedValue({ id: 'expense-server-pk' });
      prisma.expenseTag.upsert.mockResolvedValue({});
      prisma.tag.update.mockResolvedValue({});

      const result = await service.addToExpense('acc-1', 'tag-1', 'expense-local-client-id');

      expect(result).toEqual({ success: true });
      const expenseWhere = prisma.expense.findFirst.mock.calls[0][0].where;
      expect(expenseWhere.OR).toEqual([
        { id: 'expense-local-client-id' },
        { clientId: 'expense-local-client-id' },
      ]);
      const upsertArgs = prisma.expenseTag.upsert.mock.calls[0][0];
      expect(upsertArgs.where).toEqual({
        expenseId_tagId: { expenseId: 'expense-server-pk', tagId: 'tag-1' },
      });
      const updateArgs = prisma.tag.update.mock.calls[0][0];
      expect(updateArgs).toEqual({
        where: { id: 'tag-1' },
        data: { usageCount: { increment: 1 } },
      });
    });

    it('throws NotFoundException when the expense id/clientId does not resolve to any row', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(service.addToExpense('acc-1', 'tag-1', 'unknown-expense')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.expenseTag.upsert).not.toHaveBeenCalled();
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });

  describe('removeFromExpense', () => {
    it('decrements usageCount when a live ExpenseTag link exists', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.expense.findFirst.mockResolvedValue({ id: 'expense-server-pk' });
      prisma.expenseTag.findUnique.mockResolvedValue({
        expenseId: 'expense-server-pk',
        tagId: 'tag-1',
        isDeleted: false,
      });
      prisma.expenseTag.update.mockResolvedValue({});
      prisma.tag.update.mockResolvedValue({});

      const result = await service.removeFromExpense('acc-1', 'tag-1', 'expense-local-client-id');

      expect(result).toEqual({ success: true });
      expect(prisma.expenseTag.update).toHaveBeenCalledWith({
        where: { expenseId_tagId: { expenseId: 'expense-server-pk', tagId: 'tag-1' } },
        data: { isDeleted: true },
      });
      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { usageCount: { decrement: 1 } },
      });
    });

    it('does NOT decrement usageCount when no ExpenseTag link exists (no-op)', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.expense.findFirst.mockResolvedValue({ id: 'expense-server-pk' });
      prisma.expenseTag.findUnique.mockResolvedValue(null);

      const result = await service.removeFromExpense('acc-1', 'tag-1', 'expense-local-client-id');

      expect(result).toEqual({ success: true });
      expect(prisma.expenseTag.update).not.toHaveBeenCalled();
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the expense cannot be resolved', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(
        service.removeFromExpense('acc-1', 'tag-1', 'unknown-expense'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // addToIncome / removeFromIncome — mirror of the expense paths
  // -------------------------------------------------------------------------
  describe('addToIncome', () => {
    it('resolves the income by clientId, links the tag, and increments usageCount', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.income.findFirst.mockResolvedValue({ id: 'income-server-pk' });
      prisma.incomeTag.upsert.mockResolvedValue({});
      prisma.tag.update.mockResolvedValue({});

      const result = await service.addToIncome('acc-1', 'tag-1', 'income-local-client-id');

      expect(result).toEqual({ success: true });
      const incomeWhere = prisma.income.findFirst.mock.calls[0][0].where;
      expect(incomeWhere.OR).toEqual([
        { id: 'income-local-client-id' },
        { clientId: 'income-local-client-id' },
      ]);
      const upsertArgs = prisma.incomeTag.upsert.mock.calls[0][0];
      expect(upsertArgs.where).toEqual({
        incomeId_tagId: { incomeId: 'income-server-pk', tagId: 'tag-1' },
      });
      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { usageCount: { increment: 1 } },
      });
    });

    it('throws NotFoundException when the income id/clientId does not resolve to any row', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.income.findFirst.mockResolvedValue(null);

      await expect(service.addToIncome('acc-1', 'tag-1', 'unknown-income')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.incomeTag.upsert).not.toHaveBeenCalled();
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });

  describe('removeFromIncome', () => {
    it('decrements usageCount when a live IncomeTag link exists', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.income.findFirst.mockResolvedValue({ id: 'income-server-pk' });
      prisma.incomeTag.findUnique.mockResolvedValue({
        incomeId: 'income-server-pk',
        tagId: 'tag-1',
        isDeleted: false,
      });
      prisma.incomeTag.update.mockResolvedValue({});
      prisma.tag.update.mockResolvedValue({});

      const result = await service.removeFromIncome('acc-1', 'tag-1', 'income-local-client-id');

      expect(result).toEqual({ success: true });
      expect(prisma.incomeTag.update).toHaveBeenCalledWith({
        where: { incomeId_tagId: { incomeId: 'income-server-pk', tagId: 'tag-1' } },
        data: { isDeleted: true },
      });
      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { usageCount: { decrement: 1 } },
      });
    });

    it('does NOT decrement usageCount when no IncomeTag link exists (no-op)', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.income.findFirst.mockResolvedValue({ id: 'income-server-pk' });
      prisma.incomeTag.findUnique.mockResolvedValue(null);

      const result = await service.removeFromIncome('acc-1', 'tag-1', 'income-local-client-id');

      expect(result).toEqual({ success: true });
      expect(prisma.incomeTag.update).not.toHaveBeenCalled();
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the income cannot be resolved', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.income.findFirst.mockResolvedValue(null);

      await expect(
        service.removeFromIncome('acc-1', 'tag-1', 'unknown-income'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // update / remove — ownership check goes through the same id-or-clientId
  // resolution as findOne
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('resolves the target tag via findOne (id or clientId) before updating', async () => {
      const { service, prisma } = makeService();
      const existing = { id: 'tag-1', name: 'Old', accountId: 'acc-1' };
      prisma.tag.findFirst.mockResolvedValue(existing);
      prisma.tag.update.mockResolvedValue({ id: 'tag-1', name: 'New' });

      const result = await service.update('acc-1', 'local-client-id', { name: 'New' } as any);

      expect(result).toEqual({ id: 'tag-1', name: 'New' });
      const findWhere = prisma.tag.findFirst.mock.calls[0][0].where;
      expect(findWhere.OR).toEqual([{ id: 'local-client-id' }, { clientId: 'local-client-id' }]);
      // Updates by the resolved server PK, not the raw clientId param.
      expect(prisma.tag.update.mock.calls[0][0].where).toEqual({ id: 'tag-1' });
    });

    it('throws NotFoundException when the tag cannot be resolved', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.update('acc-1', 'missing', { name: 'New' } as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes the tag resolved via id-or-clientId', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue({ id: 'tag-1', accountId: 'acc-1' });
      prisma.tag.update.mockResolvedValue({ id: 'tag-1', isDeleted: true });

      const result = await service.remove('acc-1', 'local-client-id');

      expect(result).toEqual({ id: 'tag-1', isDeleted: true });
      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { isDeleted: true },
      });
    });

    it('throws NotFoundException when the tag cannot be resolved', async () => {
      const { service, prisma } = makeService();
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.remove('acc-1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });
});
