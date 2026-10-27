import { findKeyedCategory, createOrReuseKeyed } from './category-key.util';

const row = (id: string, name: string, systemKey: string | null = null, type = 'expense') => ({ id, name, type, systemKey });

describe('findKeyedCategory', () => {
  it('prefers the row carrying the key over a keyless equal-name row', () => {
    const rows = [row('a', 'Groceries'), row('b', 'Zakupy spożywcze', 'groceries')];
    expect(findKeyedCategory('Groceries', 'expense', rows)?.id).toBe('b');
  });

  it('matches a keyless row whose name maps to the same key', () => {
    expect(findKeyedCategory('Groceries', 'expense', [row('a', 'Продукты')])?.id).toBe('a');
  });

  it('falls back to an equal normalized name for a non-catalog name', () => {
    expect(findKeyedCategory('  piwo ', 'expense', [row('a', 'Piwo')])?.id).toBe('a');
    expect(findKeyedCategory('Piwo', 'expense', [row('a', 'Wino')])).toBeNull();
  });

  it('is type-scoped', () => {
    expect(findKeyedCategory('Gifts', 'income', [row('a', 'Gifts', 'gifts', 'expense')])).toBeNull();
  });
});

describe('createOrReuseKeyed', () => {
  function prismaWith(live: any[], createImpl?: jest.Mock) {
    return {
      category: {
        findMany: jest.fn().mockResolvedValue(live),
        findFirst: jest.fn().mockResolvedValue(null),
        create: createImpl ?? jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data })),
      },
    } as any;
  }

  it('reuses the keyed row for a translated catalog name', async () => {
    const prisma = prismaWith([row('k', 'Zakupy spożywcze', 'groceries')]);
    const r = await createOrReuseKeyed(prisma, { accountId: 'acc', name: 'Groceries', type: 'expense' });
    expect(r.id).toBe('k');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('creates a keyed row for a new catalog name and a keyless one otherwise', async () => {
    const prisma = prismaWith([]);
    await createOrReuseKeyed(prisma, { accountId: 'acc', name: 'Zakupy spożywcze', type: 'expense' });
    expect(prisma.category.create.mock.calls[0][0].data.systemKey).toBe('groceries');
    await createOrReuseKeyed(prisma, { accountId: 'acc', name: 'Piwo', type: 'expense' });
    expect(prisma.category.create.mock.calls[1][0].data.systemKey).toBeNull();
  });

  it('re-reads the winner on P2002', async () => {
    const create = jest.fn().mockRejectedValue({ code: 'P2002' });
    const prisma = prismaWith([], create);
    prisma.category.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row('w', 'Groceries', 'groceries')]);
    const r = await createOrReuseKeyed(prisma, { accountId: 'acc', name: 'Zakupy spożywcze', type: 'expense' });
    expect(r.id).toBe('w');
  });

  it('rethrows P2002 when nothing can be re-read, and any other error', async () => {
    const prisma = prismaWith([], jest.fn().mockRejectedValue({ code: 'P2002' }));
    await expect(createOrReuseKeyed(prisma, { accountId: 'a', name: 'X', type: 'expense' })).rejects.toEqual({ code: 'P2002' });
    const prisma2 = prismaWith([], jest.fn().mockRejectedValue(new Error('boom')));
    await expect(createOrReuseKeyed(prisma2, { accountId: 'a', name: 'X', type: 'expense' })).rejects.toThrow('boom');
  });

  it('revives a soft-deleted row that alone holds the name when the create collides', async () => {
    const deleted = { id: 'd', name: 'Piwo', type: 'expense', isDeleted: true };
    const prisma = prismaWith([], jest.fn().mockRejectedValue({ code: 'P2002' }));
    prisma.category.findFirst.mockResolvedValue(deleted);
    prisma.category.update = jest.fn().mockResolvedValue({ ...deleted, isDeleted: false });
    const r = await createOrReuseKeyed(prisma, { accountId: 'a', name: 'Piwo', type: 'expense' });
    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'd' }, data: { isDeleted: false } });
    expect(r.isDeleted).toBe(false);
  });
});
