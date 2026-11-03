import { isPublicCategory, listPublicCategories, publicCategoryWhere } from './public-categories.query';

/**
 * Ruling 19: GET /public/v1/categories must list exactly the categories an expense write accepts.
 * Both go through `publicCategoryWhere`; this pins that they query the same rows.
 */
describe('public category scope', () => {
  const prisma = {
    category: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async (): Promise<{ id: string } | null> => null),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('is account-owned, live, expense type — no global system rows', () => {
    expect(publicCategoryWhere('acc-1')).toEqual({ accountId: 'acc-1', type: 'expense', isDeleted: false });
  });

  it('income type swaps only the type filter', () => {
    expect(publicCategoryWhere('a', 'income')).toEqual({ accountId: 'a', type: 'income', isDeleted: false });
    expect(publicCategoryWhere('a')).toEqual({ accountId: 'a', type: 'expense', isDeleted: false });
  });

  it('list and check take the type', async () => {
    await listPublicCategories(prisma as any, 'a', 'income');
    await isPublicCategory(prisma as any, 'a', 'c-1', 'income');
    expect((prisma.category.findMany.mock.calls[0] as any[])[0].where.type).toBe('income');
    expect((prisma.category.findFirst.mock.calls[0] as any[])[0].where.type).toBe('income');
  });

  it('the list and the write check filter by the identical predicate', async () => {
    await listPublicCategories(prisma as any, 'acc-1');
    await isPublicCategory(prisma as any, 'acc-1', 'c-1');

    const listWhere = (prisma.category.findMany.mock.calls[0] as any[])[0].where;
    const { id, ...checkWhere } = (prisma.category.findFirst.mock.calls[0] as any[])[0].where;
    expect(id).toBe('c-1');
    expect(checkWhere).toEqual(listWhere);
  });

  it('isPublicCategory is true only for a row the predicate matches', async () => {
    expect(await isPublicCategory(prisma as any, 'acc-1', 'c-1')).toBe(false);
    prisma.category.findFirst.mockResolvedValueOnce({ id: 'c-1' });
    expect(await isPublicCategory(prisma as any, 'acc-1', 'c-1')).toBe(true);
  });
});
