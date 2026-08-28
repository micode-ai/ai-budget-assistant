import { ProductRulesService, normalizeProductName } from './product-rules.service';

describe('normalizeProductName', () => {
  it('reduces a product to letters and digits so the same line matches across receipts', () => {
    // Spacing, punctuation, case and diacritics are all things two readings of
    // one printed line disagree about; none of them is a different product.
    // The exhaustive cases live in product-key.spec.ts.
    expect(normalizeProductName('  Mleko Łaciate 3,2% 1L ')).toBe('mlekolaciate321l');
  });
});

describe('ProductRulesService', () => {
  const makePrisma = () => ({
    productCategoryRule: {
      findMany: jest.fn().mockResolvedValue([
        { canonicalNameNormalized: 'piwozywiec500ml', categoryId: 'c-alc' },
      ]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  });

  it('returns rules as a normalized-name → categoryId map', async () => {
    const prisma = makePrisma();
    const service = new ProductRulesService(prisma as any);

    const map = await service.getRulesMap('acc-1');

    expect(map.get('piwozywiec500ml')).toBe('c-alc');
    expect(prisma.productCategoryRule.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      select: { canonicalNameNormalized: true, categoryId: true },
    });
  });

  it('upserts one rule per product, normalizing the key', async () => {
    const prisma = makePrisma();
    const service = new ProductRulesService(prisma as any);

    await service.upsertRules('acc-1', [{ ruleKey: '  Piwo Żywiec 500ml', categoryId: 'c-alc' }]);

    expect(prisma.productCategoryRule.upsert).toHaveBeenCalledWith({
      where: { accountId_canonicalNameNormalized: { accountId: 'acc-1', canonicalNameNormalized: 'piwozywiec500ml' } },
      create: { accountId: 'acc-1', canonicalNameNormalized: 'piwozywiec500ml', categoryId: 'c-alc' },
      update: { categoryId: 'c-alc' },
    });
  });

  it('skips entries with a blank name and never throws', async () => {
    const prisma = makePrisma();
    prisma.productCategoryRule.upsert.mockRejectedValueOnce(new Error('db down'));
    const service = new ProductRulesService(prisma as any);

    await expect(
      service.upsertRules('acc-1', [
        { ruleKey: '   ', categoryId: 'c-alc' },
        { ruleKey: 'chleb', categoryId: 'c-food' },
      ]),
    ).resolves.toBeUndefined();

    expect(prisma.productCategoryRule.upsert).toHaveBeenCalledTimes(1);
  });
});
