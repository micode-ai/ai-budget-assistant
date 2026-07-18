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
  };
}

describe('MerchantRulesService', () => {
  describe('upsertRule', () => {
    it('upserts on the (accountId, merchantNormalized) composite key with categoryId in both create and update branches', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.upsert.mockResolvedValue({});
      const service = new MerchantRulesService(prisma as any);

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
      const service = new MerchantRulesService(prisma as any);

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
      const service = new MerchantRulesService(prisma as any);

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
      const service = new MerchantRulesService(prisma as any);

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
      const service = new MerchantRulesService(prisma as any);

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
      const service = new MerchantRulesService(prisma as any);

      const [result] = await service.listRules('acc1');

      expect(result.categoryIcon).toBeNull();
    });
  });

  describe('deleteRule', () => {
    it('deletes a rule that belongs to the account', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findUnique.mockResolvedValue({ accountId: 'acc1' });
      prisma.merchantCategoryRule.delete.mockResolvedValue({});
      const service = new MerchantRulesService(prisma as any);

      await service.deleteRule('acc1', 'rule1');

      expect(prisma.merchantCategoryRule.findUnique).toHaveBeenCalledWith({ where: { id: 'rule1' } });
      expect(prisma.merchantCategoryRule.delete).toHaveBeenCalledWith({ where: { id: 'rule1' } });
    });

    it('rejects with NotFoundException when the rule belongs to a different account (cross-account authorization)', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findUnique.mockResolvedValue({ accountId: 'other-acc' });
      const service = new MerchantRulesService(prisma as any);

      await expect(service.deleteRule('acc1', 'rule1')).rejects.toThrow(NotFoundException);
      expect(prisma.merchantCategoryRule.delete).not.toHaveBeenCalled();
    });

    it('rejects with NotFoundException when the rule does not exist', async () => {
      const prisma = makePrisma();
      prisma.merchantCategoryRule.findUnique.mockResolvedValue(null);
      const service = new MerchantRulesService(prisma as any);

      await expect(service.deleteRule('acc1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.merchantCategoryRule.delete).not.toHaveBeenCalled();
    });
  });
});
