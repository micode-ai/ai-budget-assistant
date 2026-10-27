import {
  resolveExpenseCategoryId,
  resolveCategoryIdForUpdate,
} from './expense-category-resolver.util';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function makePrisma(overrides: {
  findUniqueResult?: any;
  byClientId?: any;
  byName?: any;
  byDefaultWords?: any;
  created?: any;
  live?: any[];
} = {}) {
  const category = {
    findUnique: jest.fn().mockResolvedValue(overrides.findUniqueResult ?? null),
    // Three different lookups land on findFirst: clientId, exact name, and the
    // `default-` word match. They are told apart by the shape of the where.
    findFirst: jest.fn().mockImplementation(({ where }: any) => {
      if (where?.clientId !== undefined) return Promise.resolve(overrides.byClientId ?? null);
      if (where?.AND) return Promise.resolve(overrides.byDefaultWords ?? null);
      return Promise.resolve(overrides.byName ?? null);
    }),
    findMany: jest.fn().mockResolvedValue(overrides.live ?? []),
    create: jest
      .fn()
      .mockImplementation(({ data }: any) =>
        Promise.resolve(overrides.created ?? { id: 'created-id', ...data }),
      ),
  };
  return { category } as any;
}

describe('resolveExpenseCategoryId - system keys', () => {
  it('reuses the keyed row for a translated name', async () => {
    const prisma = makePrisma({ live: [{ id: 'k', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries' }] });
    await expect(resolveExpenseCategoryId(prisma, 'Groceries', 'acc-1')).resolves.toBe('k');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('creates a keyed row for a new catalog name', async () => {
    const prisma = makePrisma();
    await resolveExpenseCategoryId(prisma, 'Groceries', 'acc-1');
    expect(prisma.category.create.mock.calls[0][0].data.systemKey).toBe('groceries');
  });
});

describe('resolveExpenseCategoryId - default ids through the catalog', () => {
  it('default-exp-groceries resolves to the keyed row named in Polish', async () => {
    const prisma = makePrisma({
      live: [
        { id: 'other', name: 'Zakupy budowlane', type: 'expense', systemKey: null },
        { id: 'k', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries' },
      ],
    });
    await expect(resolveExpenseCategoryId(prisma, 'default-exp-groceries', 'acc-1')).resolves.toBe('k');
    expect(prisma.category.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.anything() }) }));
  });

  it('maps the seeded "Health & Fitness" slug to key health', async () => {
    const prisma = makePrisma({ live: [{ id: 'h', name: 'Zdrowie', type: 'expense', systemKey: 'health' }] });
    await expect(resolveExpenseCategoryId(prisma, 'default-exp-health---fitness', 'acc-1')).resolves.toBe('h');
  });

  it('resolves an income default id by income key', async () => {
    const prisma = makePrisma({ live: [{ id: 's', name: 'Wynagrodzenie', type: 'income', systemKey: 'salary' }] });
    await expect(resolveExpenseCategoryId(prisma, 'default-inc-salary', 'acc-1', 'income')).resolves.toBe('s');
  });
});

describe('resolveExpenseCategoryId - exact name beats the key when resolving', () => {
  // The backfill keys only one row per concept; a second row of the same
  // meaning stays keyless. A reference that always landed on the keyless row
  // by name must keep landing there, or key work would move spend.
  const UNKNOWN = '0f0e0d0c-0b0a-4908-8706-050403020100';
  const duplicates = () => [
    { id: 'keyed', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries' },
    { id: 'keyless', name: 'Groceries', type: 'expense', systemKey: null },
  ];

  it('a fallbackName equal to the keyless duplicate resolves to that row, not the keyed one', async () => {
    const prisma = makePrisma({ live: duplicates() });
    await expect(resolveExpenseCategoryId(prisma, UNKNOWN, 'acc-1', 'expense', 'Groceries')).resolves.toBe('keyless');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('a plain name reference matches the exact name after normalization', async () => {
    const prisma = makePrisma({ live: duplicates() });
    await expect(resolveExpenseCategoryId(prisma, '  groceries ', 'acc-1')).resolves.toBe('keyless');
  });

  it('default-exp-groceries resolves to the row named as the old English seed', async () => {
    const prisma = makePrisma({ live: duplicates() });
    await expect(resolveExpenseCategoryId(prisma, 'default-exp-groceries', 'acc-1')).resolves.toBe('keyless');
  });

  it('a default id built from an old seed name matches that name exactly', async () => {
    const prisma = makePrisma({
      live: [
        { id: 'keyed', name: 'Zdrowie', type: 'expense', systemKey: 'health' },
        { id: 'keyless', name: 'Health & Fitness', type: 'expense', systemKey: null },
      ],
    });
    await expect(resolveExpenseCategoryId(prisma, 'default-exp-health---fitness', 'acc-1')).resolves.toBe('keyless');
  });

  it('with only the keyed row, both the name and the default id still reach it', async () => {
    const live = [{ id: 'keyed', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries' }];
    await expect(resolveExpenseCategoryId(makePrisma({ live }), UNKNOWN, 'acc-1', 'expense', 'Groceries')).resolves.toBe('keyed');
    await expect(resolveExpenseCategoryId(makePrisma({ live }), 'default-exp-groceries', 'acc-1')).resolves.toBe('keyed');
  });
});

describe('resolveExpenseCategoryId', () => {
  it('returns the id when the UUID is a category of this account', async () => {
    const prisma = makePrisma({ findUniqueResult: { id: UUID_A, accountId: 'acc-1' } });

    await expect(resolveExpenseCategoryId(prisma, UUID_A, 'acc-1')).resolves.toBe(UUID_A);
  });

  // ABA-566. The mobile addresses a category by its LOCAL id and sends that
  // same value as `clientId` when it creates one, so an id that is not a
  // server PK may still identify the row.
  it('falls back to matching the value as a clientId when it is not a server PK', async () => {
    const prisma = makePrisma({
      findUniqueResult: null,
      byClientId: { id: UUID_B },
    });

    await expect(resolveExpenseCategoryId(prisma, UUID_A, 'acc-1')).resolves.toBe(UUID_B);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', clientId: UUID_A },
      select: { id: true },
    });
  });

  it('tries the clientId fallback for a UUID owned by a DIFFERENT account, never that row', async () => {
    // Cross-account ids must not leak in, but the string may still be a local
    // id of one of this account's own rows.
    const prisma = makePrisma({
      findUniqueResult: { id: UUID_A, accountId: 'other-acc' },
      byClientId: null,
    });

    await expect(resolveExpenseCategoryId(prisma, UUID_A, 'acc-1')).resolves.toBeNull();
  });

  it('auto-creates an expense category by default and an income one when asked', async () => {
    const prismaExp = makePrisma({ created: { id: 'new-exp' } });
    await expect(resolveExpenseCategoryId(prismaExp, 'Restauracja', 'acc-1')).resolves.toBe('new-exp');
    expect(prismaExp.category.create).toHaveBeenCalledWith({
      data: { accountId: 'acc-1', name: 'Restauracja', type: 'expense', systemKey: null },
    });

    const prismaInc = makePrisma({ created: { id: 'new-inc' } });
    await expect(resolveExpenseCategoryId(prismaInc, 'Premia', 'acc-1', 'income')).resolves.toBe('new-inc');
    expect(prismaInc.category.create).toHaveBeenCalledWith({
      data: { accountId: 'acc-1', name: 'Premia', type: 'income', systemKey: null },
    });
  });

  it('reuses an equivalent translated category instead of auto-creating', async () => {
    const prisma = makePrisma({ live: [{ id: 'cat-groceries', name: 'Groceries' }] });

    await expect(resolveExpenseCategoryId(prisma, 'Zakupy spożywcze', 'acc-1')).resolves.toBe('cat-groceries');
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: 'acc-1', type: 'expense', isDeleted: false }),
      }),
    );
  });

  it('scopes the name lookup to the account, so another account cannot be matched', async () => {
    const prisma = makePrisma({ byName: { id: 'named' } });

    await expect(resolveExpenseCategoryId(prisma, 'Restauracja', 'acc-1')).resolves.toBe('named');
    expect(prisma.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: 'acc-1' }),
      }),
    );
  });
});

/**
 * ABA-666. Production: an account held a DELETED expense category and a live
 * income category with the same name. The mobile re-pushes pending incomes
 * with the category NAME, the unfiltered name lookup returned the deleted
 * expense row, and every re-assigned income was filed under it. This mock
 * filters like the database does, so a where clause that ignores `type` or
 * `isDeleted` picks the wrong row here as it did in production.
 */
describe('resolveExpenseCategoryId — same name on two rows', () => {
  const ROWS: Array<Record<string, any>> = [
    // Older row first, as a heap scan with no ORDER BY would return it.
    { id: 'deleted-expense', accountId: 'acc-1', name: 'Salary', type: 'expense', isDeleted: true },
    { id: 'live-income', accountId: 'acc-1', name: 'Salary', type: 'income', isDeleted: false },
  ];

  function dbLike(rows = ROWS) {
    const matches = (row: any, where: any) =>
      (where.accountId === undefined || row.accountId === where.accountId) &&
      (where.clientId === undefined || row.clientId === where.clientId) &&
      (where.type === undefined || row.type === where.type) &&
      (where.isDeleted === undefined || row.isDeleted === where.isDeleted) &&
      (where.name === undefined || row.name.toLowerCase() === where.name.equals.toLowerCase());
    return {
      category: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
        ),
        findFirst: jest.fn().mockImplementation(({ where, orderBy }: any) => {
          let found = rows.filter((r) => matches(r, where));
          if (orderBy?.isDeleted === 'asc') found = [...found].sort((a, b) => Number(a.isDeleted) - Number(b.isDeleted));
          return Promise.resolve(found[0] ?? null);
        }),
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(rows.filter((r) => matches(r, where))),
        ),
        create: jest.fn().mockResolvedValue({ id: 'created' }),
      },
    } as any;
  }

  it('files an income pushed by name under the live income category, not the deleted expense one', async () => {
    const prisma = dbLike();

    await expect(resolveExpenseCategoryId(prisma, 'salary', 'acc-1', 'income')).resolves.toBe('live-income');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('prefers a live row of the same kind over a deleted one', async () => {
    const prisma = dbLike([
      { id: 'deleted-income', accountId: 'acc-1', name: 'Salary', type: 'income', isDeleted: true },
      { id: 'live-income', accountId: 'acc-1', name: 'Salary', type: 'income', isDeleted: false },
    ]);

    await expect(resolveExpenseCategoryId(prisma, 'Salary', 'acc-1', 'income')).resolves.toBe('live-income');
  });

  it('reuses a deleted row of the same kind rather than colliding with it on create', async () => {
    const prisma = dbLike([ROWS[0]]);

    await expect(resolveExpenseCategoryId(prisma, 'Salary', 'acc-1', 'expense')).resolves.toBe('deleted-expense');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('refuses a server PK of the other kind', async () => {
    const prisma = dbLike([{ ...ROWS[0], id: UUID_A }, ROWS[1]]);

    await expect(resolveExpenseCategoryId(prisma, UUID_A, 'acc-1', 'income')).resolves.toBeNull();
    await expect(resolveExpenseCategoryId(prisma, UUID_A, 'acc-1', 'expense')).resolves.toBe(UUID_A);
  });
});

describe('resolveExpenseCategoryId — id with a name fallback', () => {
  const LIVE = '9b2d4e6f-1a3c-4e5f-8a7b-0c1d2e3f4a5b';
  const UNKNOWN = '0f0e0d0c-0b0a-4908-8706-050403020100';

  function dbLike(rows: Array<Record<string, any>>) {
    return {
      category: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
        ),
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            rows.find(
              (r) =>
                r.accountId === where.accountId &&
                (where.clientId === undefined || r.clientId === where.clientId) &&
                (where.type === undefined || r.type === where.type) &&
                (where.name === undefined || r.name.toLowerCase() === where.name.equals.toLowerCase()),
            ) ?? null,
          ),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'created' }),
      },
    } as any;
  }

  it('takes the id and ignores the name when the id resolves', async () => {
    const prisma = dbLike([
      { id: LIVE, accountId: 'acc-1', name: 'Salary', type: 'income' },
      { id: 'other', accountId: 'acc-1', name: 'Bonus', type: 'income' },
    ]);

    await expect(resolveExpenseCategoryId(prisma, LIVE, 'acc-1', 'income', 'Bonus')).resolves.toBe(LIVE);
  });

  it('falls back to the name when the id has not reached the server yet', async () => {
    const prisma = dbLike([{ id: LIVE, accountId: 'acc-1', name: 'Salary', type: 'income' }]);

    await expect(resolveExpenseCategoryId(prisma, UNKNOWN, 'acc-1', 'income', 'salary')).resolves.toBe(LIVE);
  });

  it('creates the category from the name when nothing else matches', async () => {
    const prisma = dbLike([]);

    await expect(resolveExpenseCategoryId(prisma, UNKNOWN, 'acc-1', 'income', 'Salary')).resolves.toBe('created');
    expect(prisma.category.create).toHaveBeenCalledWith({ data: { accountId: 'acc-1', name: 'Salary', type: 'income', systemKey: 'salary' } });
  });

  it('still returns null for an unknown id sent without a name', async () => {
    await expect(resolveExpenseCategoryId(dbLike([]), UNKNOWN, 'acc-1', 'income')).resolves.toBeNull();
  });
});

describe('resolveCategoryIdForUpdate', () => {
  it('leaves the field untouched when the caller sent nothing', async () => {
    const prisma = makePrisma();

    await expect(resolveCategoryIdForUpdate(prisma, undefined, 'acc-1')).resolves.toBeUndefined();
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
  });

  it('clears the category on an explicit null or empty string', async () => {
    const prisma = makePrisma();

    await expect(resolveCategoryIdForUpdate(prisma, null, 'acc-1')).resolves.toBeNull();
    await expect(resolveCategoryIdForUpdate(prisma, '', 'acc-1')).resolves.toBeNull();
  });

  it('returns the resolved id when it resolves', async () => {
    const prisma = makePrisma({ findUniqueResult: { id: UUID_A, accountId: 'acc-1' } });

    await expect(resolveCategoryIdForUpdate(prisma, UUID_A, 'acc-1')).resolves.toBe(UUID_A);
  });

  // The whole point of ABA-566: an id the server cannot resolve used to become
  // `null`, and Prisma then ERASED a category the expense already had. 31
  // imported expenses (7 182,13 zł) on one production account lost their
  // category that way while the phone kept showing it.
  it('leaves the stored category alone when a non-empty id cannot be resolved', async () => {
    const prisma = makePrisma({ findUniqueResult: null, byClientId: null });

    await expect(resolveCategoryIdForUpdate(prisma, UUID_A, 'acc-1')).resolves.toBeUndefined();
  });

  it('never auto-creates from an unresolvable UUID', async () => {
    const prisma = makePrisma({ findUniqueResult: null, byClientId: null });

    await resolveCategoryIdForUpdate(prisma, UUID_A, 'acc-1');

    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});
