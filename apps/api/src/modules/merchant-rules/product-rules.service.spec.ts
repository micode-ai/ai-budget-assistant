import { ProductRulesService, normalizeProductName } from './product-rules.service';

describe('normalizeProductName', () => {
  it('trims and lowercases so the same product matches across receipts', () => {
    expect(normalizeProductName('  Mleko Łaciate 3,2% 1L ')).toBe('mleko łaciate 3,2% 1l');
  });
});

describe('ProductRulesService', () => {
  const makePrisma = () => ({
    productCategoryRule: {
      findMany: jest.fn().mockResolvedValue([
        { canonicalNameNormalized: 'piwo żywiec 500ml', categoryId: 'c-alc' },
      ]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  });

  it('returns rules as a normalized-name → categoryId map', async () => {
    const prisma = makePrisma();
    const service = new ProductRulesService(prisma as any);

    const map = await service.getRulesMap('acc-1');

    expect(map.get('piwo żywiec 500ml')).toBe('c-alc');
    expect(prisma.productCategoryRule.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      select: { canonicalNameNormalized: true, categoryId: true },
    });
  });

  it('upserts one rule per product, normalizing the key', async () => {
    const prisma = makePrisma();
    const service = new ProductRulesService(prisma as any);

    await service.upsertRules('acc-1', [{ canonicalName: '  Piwo Żywiec 500ml', categoryId: 'c-alc' }]);

    expect(prisma.productCategoryRule.upsert).toHaveBeenCalledWith({
      where: { accountId_canonicalNameNormalized: { accountId: 'acc-1', canonicalNameNormalized: 'piwo żywiec 500ml' } },
      create: { accountId: 'acc-1', canonicalNameNormalized: 'piwo żywiec 500ml', categoryId: 'c-alc' },
      update: { categoryId: 'c-alc' },
    });
  });

  it('skips entries with a blank name and never throws', async () => {
    const prisma = makePrisma();
    prisma.productCategoryRule.upsert.mockRejectedValueOnce(new Error('db down'));
    const service = new ProductRulesService(prisma as any);

    await expect(
      service.upsertRules('acc-1', [
        { canonicalName: '   ', categoryId: 'c-alc' },
        { canonicalName: 'chleb', categoryId: 'c-food' },
      ]),
    ).resolves.toBeUndefined();

    expect(prisma.productCategoryRule.upsert).toHaveBeenCalledTimes(1);
  });
});
