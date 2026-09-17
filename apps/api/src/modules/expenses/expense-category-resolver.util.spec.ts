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
    create: jest
      .fn()
      .mockImplementation(({ data }: any) =>
        Promise.resolve(overrides.created ?? { id: 'created-id', ...data }),
      ),
  };
  return { category } as any;
}

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
      data: { accountId: 'acc-1', name: 'Restauracja', type: 'expense' },
    });

    const prismaInc = makePrisma({ created: { id: 'new-inc' } });
    await expect(resolveExpenseCategoryId(prismaInc, 'Premia', 'acc-1', 'income')).resolves.toBe('new-inc');
    expect(prismaInc.category.create).toHaveBeenCalledWith({
      data: { accountId: 'acc-1', name: 'Premia', type: 'income' },
    });
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
