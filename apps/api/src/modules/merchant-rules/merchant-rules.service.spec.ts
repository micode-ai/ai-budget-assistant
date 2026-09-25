import { NotFoundException } from '@nestjs/common';
import { MerchantRulesService } from './merchant-rules.service';

function makePrisma() {
  return {
    merchantCategoryRule: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    expense: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

function makeCacheService() {
  return {
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
  };
}

const OWNED_RULE_SELECT = {
  id: true,
  accountId: true,
  merchantNormalized: true,
  categoryId: true,
  category: { select: { name: true } },
};

describe('MerchantRulesService', () => {
  describe('upsertRule', () => {
    it('upserts on the (accountId, merchantNormalized) composite key with categoryId in both create and update branches', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.upsert.mockResolvedValue({});
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await service.upsertRule('acc1', 'biedronka', 'cat1');

      expect(prisma.merchantCategoryRule.upsert).toHaveBeenCalledWith({
        where: { accountId_merchantNormalized: { accountId: 'acc1', merchantNormalized: 'biedronka' } },
        create: { accountId: 'acc1', merchantNormalized: 'biedronka', categoryId: 'cat1' },
        update: { categoryId: 'cat1' },
      });
    });

    it('propagates a rejected upsert (caller learning is fire-and-forget, but the promise itself must reject)', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.upsert.mockRejectedValue(new Error('db down'));
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await expect(service.upsertRule('acc1', 'biedronka', 'cat1')).rejects.toThrow('db down');
    });
  });

  describe('getRulesMap', () => {
    it('returns a Map keyed by merchantNormalized scoped to the account', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findMany.mockResolvedValue([
        { merchantNormalized: 'biedronka', categoryId: 'cat1' },
        { merchantNormalized: 'lidl', categoryId: 'cat2' },
      ]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      const map = await service.getRulesMap('acc1');

      expect(prisma.merchantCategoryRule.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1' },
        select: { merchantNormalized: true, categoryId: true },
      });
      expect(map).toBeInstanceOf(Map);
      expect(map.get('biedronka')).toBe('cat1');
      expect(map.get('lidl')).toBe('cat2');
      expect(map.size).toBe(2);
    });

    it('returns an empty Map when the account has no rules', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findMany.mockResolvedValue([]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      const map = await service.getRulesMap('acc1');

      expect(map.size).toBe(0);
    });
  });

  describe('listRules', () => {
    it('maps Prisma rows into MerchantCategoryRuleResponse shape, ordered by merchantNormalized', async () => {
      const prisma = makePrisma();
      const createdAt = new Date('2026-07-01T00:00:00Z');
      const updatedAt = new Date('2026-07-02T00:00:00Z');
      prisma.merchantCategoryRule.findMany.mockResolvedValue([
        {
          id: 'rule1',
          merchantNormalized: 'biedronka',
          categoryId: 'cat1',
          createdAt,
          updatedAt,
          category: { name: 'Groceries', icon: '🛒' },
        },
      ]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      const result = await service.listRules('acc1');

      expect(prisma.merchantCategoryRule.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1' },
        include: { category: { select: { name: true, icon: true } } },
        orderBy: { merchantNormalized: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'rule1',
          merchantNormalized: 'biedronka',
          categoryId: 'cat1',
          categoryName: 'Groceries',
          categoryIcon: '🛒',
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ]);
    });

    it('falls back to null when the category has no icon', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findMany.mockResolvedValue([
        {
          id: 'rule1',
          merchantNormalized: 'lidl',
          categoryId: 'cat2',
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { name: 'Groceries', icon: null },
        },
      ]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      const [result] = await service.listRules('acc1');

      expect(result.categoryIcon).toBeNull();
    });
  });

  describe('deleteRule', () => {
    it('deletes a rule that belongs to the account', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findUnique.mockResolvedValue({
        id: 'rule1',
        accountId: 'acc1',
        merchantNormalized: 'biedronka',
        categoryId: 'cat1',
        category: { name: 'Groceries' },
      });
      prisma.merchantCategoryRule.delete.mockResolvedValue({});
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await service.deleteRule('acc1', 'rule1');

      expect(prisma.merchantCategoryRule.findUnique).toHaveBeenCalledWith({
        where: { id: 'rule1' },
        select: OWNED_RULE_SELECT,
      });
      expect(prisma.merchantCategoryRule.delete).toHaveBeenCalledWith({ where: { id: 'rule1' } });
    });

    it('rejects with NotFoundException when the rule belongs to a different account (cross-account authorization)', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findUnique.mockResolvedValue({
        id: 'rule1',
        accountId: 'other-acc',
        merchantNormalized: 'biedronka',
        categoryId: 'cat1',
        category: { name: 'Groceries' },
      });
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await expect(service.deleteRule('acc1', 'rule1')).rejects.toThrow(NotFoundException);
      expect(prisma.merchantCategoryRule.delete).not.toHaveBeenCalled();
    });

    it('rejects with NotFoundException when the rule does not exist', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findUnique.mockResolvedValue(null);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await expect(service.deleteRule('acc1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.merchantCategoryRule.delete).not.toHaveBeenCalled();
    });
  });

  describe('previewReapply', () => {
    function mockOwnedRule(prisma: ReturnType<typeof makePrisma>, overrides: Partial<any> = {}) {
      prisma.merchantCategoryRule.findUnique.mockResolvedValue({
        id: 'rule1',
        accountId: 'acc1',
        merchantNormalized: 'biedronka',
        categoryId: 'cat-target',
        category: { name: 'Groceries' },
        ...overrides,
      });
    }

    it('throws NotFoundException when the rule does not belong to the account', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma, { accountId: 'other-acc' });
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await expect(service.previewReapply('acc1', 'rule1')).rejects.toThrow(NotFoundException);
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('groups candidate expenses by their current category, sorted by count descending, excluding the target category', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([
        { categoryId: 'cat-a', category: { name: 'Other' } },
        { categoryId: 'cat-a', category: { name: 'Other' } },
        { categoryId: 'cat-b', category: { name: 'Dining' } },
        { categoryId: 'cat-a', category: { name: 'Other' } },
        // Already correctly categorized — dropped, never counted.
        { categoryId: 'cat-target', category: { name: 'Groceries' } },
      ]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      const preview = await service.previewReapply('acc1', 'rule1');

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          accountId: 'acc1',
          isDeleted: false,
          isPlanned: false,
          isSplitReceivable: false,
          isDebt: false,
          encryptedPayload: null,
          merchant: { equals: 'biedronka', mode: 'insensitive' },
          categoryId: { not: null },
        },
        select: { categoryId: true, category: { select: { name: true } } },
      });
      expect(preview).toEqual({
        ruleId: 'rule1',
        merchantNormalized: 'biedronka',
        targetCategoryId: 'cat-target',
        targetCategoryName: 'Groceries',
        totalCount: 4,
        groups: [
          { categoryId: 'cat-a', categoryName: 'Other', count: 3 },
          { categoryId: 'cat-b', categoryName: 'Dining', count: 1 },
        ],
      });
    });

    it('returns an empty groups list and zero totalCount when there is nothing to reapply', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      const preview = await service.previewReapply('acc1', 'rule1');

      expect(preview.groups).toEqual([]);
      expect(preview.totalCount).toBe(0);
    });

    it('relies on the Prisma where filter to exclude E2EE, planned, split-receivable, debt and deleted rows', async () => {
      // The exclusion is expressed entirely in the query passed to Prisma — this
      // pins that every exclusion flag is present so a future edit can't drop one silently.
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([]);
      const service = new MerchantRulesService(prisma as any, makeCacheService() as any);

      await service.previewReapply('acc1', 'rule1');

      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where.encryptedPayload).toBeNull();
      expect(where.isDeleted).toBe(false);
      expect(where.isPlanned).toBe(false);
      expect(where.isSplitReceivable).toBe(false);
      expect(where.isDebt).toBe(false);
    });
  });

  describe('reapply', () => {
    function mockOwnedRule(prisma: ReturnType<typeof makePrisma>, overrides: Partial<any> = {}) {
      prisma.merchantCategoryRule.findUnique.mockResolvedValue({
        id: 'rule1',
        accountId: 'acc1',
        merchantNormalized: 'biedronka',
        categoryId: 'cat-target',
        category: { name: 'Groceries' },
        ...overrides,
      });
    }

    it('throws NotFoundException when the rule does not belong to the account', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma, { accountId: 'other-acc' });
      const cache = makeCacheService();
      const service = new MerchantRulesService(prisma as any, cache as any);

      await expect(service.reapply('acc1', 'rule1', ['cat-a'])).rejects.toThrow(NotFoundException);
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('moves only expenses whose current category is in the selected allow-list', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([{ id: 'exp1' }, { id: 'exp2' }]);
      prisma.expense.updateMany.mockResolvedValue({ count: 2 });
      const cache = makeCacheService();
      const service = new MerchantRulesService(prisma as any, cache as any);

      const result = await service.reapply('acc1', 'rule1', ['cat-a']);

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          accountId: 'acc1',
          isDeleted: false,
          isPlanned: false,
          isSplitReceivable: false,
          isDebt: false,
          encryptedPayload: null,
          merchant: { equals: 'biedronka', mode: 'insensitive' },
          categoryId: { in: ['cat-a'] },
        },
        select: { id: true },
      });
      expect(prisma.expense.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['exp1', 'exp2'] } },
        data: { categoryId: 'cat-target', updatedAt: expect.any(Date) },
      });
      expect(result).toEqual({ updated: 2 });
    });

    it('defensively strips the target category id from the allow-list even if the client sent it', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([{ id: 'exp1' }]);
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      const cache = makeCacheService();
      const service = new MerchantRulesService(prisma as any, cache as any);

      await service.reapply('acc1', 'rule1', ['cat-a', 'cat-target']);

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoryId: { in: ['cat-a'] } }) }),
      );
    });

    it('no-ops on an empty selection (or a selection containing only the target category) without querying expenses', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      const cache = makeCacheService();
      const service = new MerchantRulesService(prisma as any, cache as any);

      const result = await service.reapply('acc1', 'rule1', ['cat-target']);

      expect(result).toEqual({ updated: 0 });
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
      expect(prisma.expense.updateMany).not.toHaveBeenCalled();
      expect(cache.delByPrefix).not.toHaveBeenCalled();
    });

    it('no-ops when the allow-list matches no expenses, without invalidating the cache', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([]);
      const cache = makeCacheService();
      const service = new MerchantRulesService(prisma as any, cache as any);

      const result = await service.reapply('acc1', 'rule1', ['cat-a']);

      expect(result).toEqual({ updated: 0 });
      expect(prisma.expense.updateMany).not.toHaveBeenCalled();
      expect(cache.delByPrefix).not.toHaveBeenCalled();
    });

    it('invalidates the expense chat cache for the account after a successful move', async () => {
      const prisma = makePrisma();
      mockOwnedRule(prisma);
      prisma.expense.findMany.mockResolvedValue([{ id: 'exp1' }]);
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      const cache = makeCacheService();
      const service = new MerchantRulesService(prisma as any, cache as any);

      await service.reapply('acc1', 'rule1', ['cat-a']);

      expect(cache.del).toHaveBeenCalledWith('uc:acc1');
      expect(cache.delByPrefix).toHaveBeenCalledWith('chat:get_expenses:acc1:');
    });
  });
});
