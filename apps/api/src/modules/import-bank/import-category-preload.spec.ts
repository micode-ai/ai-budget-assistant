import { preloadCategories } from './import-bank-category.util';

/**
 * preloadCategories — resolving an exporting app's own taxonomy.
 *
 * A bank statement carries no categories, so this is inert for those imports.
 * It exists for exports from other budgeting apps, which do carry the user's
 * categories: migrating a history is only worth doing if it arrives organised,
 * so a name the account does not have becomes a real category instead of the
 * row landing uncategorised.
 *
 * It runs BEFORE the commit transaction on purpose. Postgres aborts an entire
 * transaction on the first unique-constraint violation, so creating categories
 * inside it would let one colliding name take down a whole import (ABA-313).
 */
function makePrisma(
  opts: { existing?: Array<{ id: string; name: string; type: string; systemKey?: string | null }> } = {},
) {
  const existing = opts.existing ?? [];

  const findFirst = jest.fn(async ({ where }: any) => {
    const wantedName = String(where.name.equals).toLowerCase();
    const found = existing.find(
      (c) => c.name.toLowerCase() === wantedName && c.type === where.type,
    );
    return found ? { id: found.id } : null;
  });

  const create = jest.fn(async ({ data }: any) => {
    const row = { id: `cat-${existing.length + 1}`, name: data.name, type: data.type };
    existing.push(row);
    return { id: row.id };
  });

  const findMany = jest.fn(async ({ where }: any) =>
    existing
      .filter((c) => c.type === where.type)
      .map((c) => ({ id: c.id, name: c.name, systemKey: c.systemKey ?? null })),
  );

  const prisma: any = { category: { findFirst, findMany, create } };

  return { prisma, findFirst, findMany, create, existing };
}

const preload = (prisma: any, rows: any[], cache = new Map<string, string | null>()) =>
  preloadCategories(prisma, 'acc-1', rows, cache).then(() => cache);

describe('preloadCategories', () => {
  it('creates a category the account does not have yet', async () => {
    const { prisma, create } = makePrisma();

    const cache = await preload(prisma, [
      { kind: 'expense', suggestedCategoryName: 'Jedzenie' },
    ]);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accountId: 'acc-1', name: 'Jedzenie', type: 'expense', systemKey: null } }),
    );
    expect(cache.get('expense:jedzenie')).toBe('cat-1');
  });

  it('reuses an existing category instead of creating a duplicate', async () => {
    const { prisma, create } = makePrisma({
      existing: [{ id: 'cat-food', name: 'Jedzenie', type: 'expense' }],
    });

    const cache = await preload(prisma, [{ kind: 'expense', suggestedCategoryName: 'Jedzenie' }]);

    expect(create).not.toHaveBeenCalled();
    expect(cache.get('expense:jedzenie')).toBe('cat-food');
  });

  it('a row named like a keyless duplicate goes to that row, not to the keyed one', async () => {
    const { prisma, create } = makePrisma({
      existing: [
        { id: 'keyed', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries' },
        { id: 'keyless', name: 'Groceries', type: 'expense', systemKey: null },
      ],
    });

    const cache = await preload(prisma, [{ kind: 'expense', suggestedCategoryName: 'Groceries' }]);

    expect(create).not.toHaveBeenCalled();
    expect(cache.get('expense:groceries')).toBe('keyless');
  });

  it('a translated name still reaches the keyed row when no row carries that name', async () => {
    const { prisma, create } = makePrisma({
      existing: [{ id: 'keyed', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries' }],
    });

    const cache = await preload(prisma, [{ kind: 'expense', suggestedCategoryName: 'Groceries' }]);

    expect(create).not.toHaveBeenCalled();
    expect(cache.get('expense:groceries')).toBe('keyed');
  });

  it('matches case-insensitively, so one export cannot mint Food and food', async () => {
    const { prisma, create } = makePrisma({
      existing: [{ id: 'cat-food', name: 'Food', type: 'expense' }],
    });

    const cache = await preload(prisma, [
      { kind: 'expense', suggestedCategoryName: 'food' },
      { kind: 'expense', suggestedCategoryName: 'FOOD' },
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(cache.get('expense:food')).toBe('cat-food');
  });

  it('maps a translated name onto the existing equivalent category', async () => {
    const { prisma, create } = makePrisma({
      existing: [{ id: 'cat-groceries', name: 'Groceries', type: 'expense' }],
    });

    const cache = await preload(prisma, [{ kind: 'expense', suggestedCategoryName: 'Zakupy spożywcze' }]);

    expect(create).not.toHaveBeenCalled();
    expect(cache.get('expense:zakupy spożywcze')).toBe('cat-groceries');
  });

  it('creates a keyed row for a new catalog name and reuses a keyed row for a translation', async () => {
    const { prisma, create } = makePrisma();
    await preload(prisma, [{ kind: 'expense', suggestedCategoryName: 'Zakupy spożywcze' }]);
    expect(create.mock.calls[0][0].data.systemKey).toBe('groceries');

    const second = makePrisma({ existing: [{ id: 'k', name: 'Groceries', type: 'expense' }] });
    const cache = await preload(second.prisma, [{ kind: 'expense', suggestedCategoryName: 'Продукты' }]);
    expect(second.create).not.toHaveBeenCalled();
    expect(cache.get('expense:продукты')).toBe('k');
  });

  it('resolves a repeated name once, however many rows use it', async () => {
    const { prisma, findFirst } = makePrisma();

    await preload(prisma, [
      { kind: 'expense', suggestedCategoryName: 'Transport' },
      { kind: 'expense', suggestedCategoryName: 'Transport' },
      { kind: 'expense', suggestedCategoryName: 'Transport' },
    ]);

    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('keeps expense and income categories of the same name apart', async () => {
    // The unique constraint is on (account_id, name, type), and "Bonus" is a
    // plausible name on both sides. Collapsing them would attach an income
    // category to expenses.
    const { prisma, create } = makePrisma();

    const cache = await preload(prisma, [
      { kind: 'expense', suggestedCategoryName: 'Bonus' },
      { kind: 'income', suggestedCategoryName: 'Bonus' },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(cache.get('expense:bonus')).not.toBe(cache.get('income:bonus'));
  });

  it('recovers from a concurrent create rather than failing the import', async () => {
    const { prisma } = makePrisma();
    prisma.category.create.mockRejectedValueOnce(new Error('P2002'));
    prisma.category.findFirst
      .mockResolvedValueOnce(null) // initial lookup: not there
      .mockResolvedValueOnce({ id: 'cat-raced' }); // re-read after the collision

    const cache = await preload(prisma, [{ kind: 'expense', suggestedCategoryName: 'Transport' }]);

    expect(cache.get('expense:transport')).toBe('cat-raced');
  });

  it('touches the database at all only when a row actually names a category', async () => {
    const { prisma, findFirst, create } = makePrisma();

    await preload(prisma, [
      { kind: 'expense' },
      { kind: 'expense', suggestedCategoryName: '   ' },
      { kind: 'fx', suggestedCategoryName: 'Exchange' },
    ]);

    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
