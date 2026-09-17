import { CategoriesService } from './categories.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

function makeService(overrides: {
  findFirstResult?: any;
  conflictResult?: any;
  updateError?: any;
} = {}) {
  const category = {
    findMany: jest.fn().mockResolvedValue([]),
    // The name-collision probe is the only lookup that excludes a row by id,
    // which is what lets it be routed to `conflictResult`. Without that split
    // an existing-category fixture would come back from the probe too, and
    // every colour-only edit would read as a clash with itself.
    findFirst: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(where?.id?.not ? overrides.conflictResult ?? null : overrides.findFirstResult ?? null),
    ),
    update: jest.fn().mockImplementation(({ where, data }: any) => {
      if (overrides.updateError) return Promise.reject(overrides.updateError);
      return Promise.resolve({ ...(overrides.findFirstResult ?? {}), id: where.id, ...data });
    }),
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new-cat-id', ...data })),
    count: jest.fn().mockResolvedValue(0),
  };
  const expense = { count: jest.fn().mockResolvedValue(0) };
  const income = { count: jest.fn().mockResolvedValue(0) };
  const budgetCategory = { count: jest.fn().mockResolvedValue(0) };
  const expenseCategorySplit = { count: jest.fn().mockResolvedValue(0) };

  const prisma: any = { category, expense, income, budgetCategory, expenseCategorySplit };
  const embeddingService: any = { embedAndStore: jest.fn().mockResolvedValue(undefined) };
  const cacheService: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };

  const service = new CategoriesService(prisma, embeddingService, cacheService);
  return { service, prisma, embeddingService, cacheService };
}

describe('CategoriesService.findAll', () => {
  it('queries system categories OR the account\'s own, excluding soft-deleted, ordered system-first then by name', async () => {
    const { service, prisma } = makeService();

    await service.findAll('acc-1');

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { OR: [{ isSystem: true }, { accountId: 'acc-1' }], isDeleted: false },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  });
});

describe('CategoriesService.create', () => {
  it('revives a soft-deleted category with the same name+type instead of creating a duplicate', async () => {
    const existing = { id: 'cat-old', name: 'Groceries', type: 'expense', isDeleted: true };
    const { service, prisma, embeddingService, cacheService } = makeService({ findFirstResult: existing });

    const dto = { name: 'Groceries', type: 'expense', icon: 'cart', color: '#fff', parentId: null };
    const result = await service.create('acc-1', 'user-1', dto);

    // Deliberately NOT filtered by isDeleted: the unique covers soft-deleted
    // rows too, so a live duplicate has to be found by this same lookup.
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', name: 'Groceries', type: 'expense' },
    });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-old' },
      data: { isDeleted: false, icon: 'cart', color: '#fff', parentId: null, userId: 'user-1' },
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(embeddingService.embedAndStore).toHaveBeenCalledWith('category', 'cat-old', 'Groceries');
    expect(cacheService.delByPrefix).toHaveBeenCalledWith('chat:get_category_breakdown:acc-1:');
    expect(cacheService.delByPrefix).toHaveBeenCalledWith('chat:get_expenses:acc-1:');
    expect(result).toEqual(expect.objectContaining({ id: 'cat-old', isDeleted: false }));
  });

  it('creates a brand-new category and stores its embedding fire-and-forget', async () => {
    const { service, prisma, embeddingService } = makeService({ findFirstResult: null });

    const dto = { name: 'Entertainment', type: 'expense', icon: 'movie', color: '#123', parentId: null };
    const result = await service.create('acc-1', 'user-1', dto);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { accountId: 'acc-1', userId: 'user-1', name: 'Entertainment', icon: 'movie', color: '#123', type: 'expense', parentId: null },
    });
    expect(embeddingService.embedAndStore).toHaveBeenCalledWith('category', 'new-cat-id', 'Entertainment');
    expect(result).toEqual(expect.objectContaining({ id: 'new-cat-id', name: 'Entertainment' }));
  });

  it('returns the existing LIVE category instead of throwing on the (accountId,name,type) unique', async () => {
    const live = { id: 'cat-live', name: 'Groceries', type: 'expense', isDeleted: false, color: '#custom' };
    const { service, prisma } = makeService({ findFirstResult: live });

    // A different color on the way in must NOT restyle the category the user
    // already customised.
    const result = await service.create('acc-1', 'user-1', {
      name: 'Groceries',
      type: 'expense',
      color: '#999',
    });

    expect(result).toBe(live);
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('reuses the row a concurrent request inserted when create() hits P2002', async () => {
    const { service, prisma } = makeService({ findFirstResult: null });
    const raced = { id: 'cat-raced', name: 'Fuel', type: 'expense', isDeleted: false };
    prisma.category.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.category.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);

    const result = await service.create('acc-1', 'user-1', { name: 'Fuel', type: 'expense' });

    expect(result).toBe(raced);
  });

  it('rethrows a non-P2002 create failure', async () => {
    const { service, prisma } = makeService({ findFirstResult: null });
    prisma.category.create.mockRejectedValueOnce({ code: 'P1001', message: 'db unreachable' });

    await expect(service.create('acc-1', 'user-1', { name: 'Fuel', type: 'expense' })).rejects.toEqual(
      expect.objectContaining({ code: 'P1001' }),
    );
  });

  it('returns the row created earlier for the same clientId (idempotent resend)', async () => {
    // Offline-first: the mobile resends the same create on a sync retry and
    // would otherwise violate @@unique([accountId, clientId]).
    const existing = { id: 'server-1', clientId: 'local-1', name: 'Kawa', type: 'expense' };
    const { service, prisma } = makeService({ findFirstResult: existing });

    const result = await service.create('acc-1', 'user-1', {
      name: 'Kawa',
      type: 'expense',
      clientId: 'local-1',
    } as any);

    expect(result).toBe(existing);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', clientId: 'local-1' },
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('stores the clientId on a brand-new create', async () => {
    const { service, prisma } = makeService({ findFirstResult: null });

    await service.create('acc-1', 'user-1', {
      name: 'Kawa',
      type: 'expense',
      clientId: 'local-1',
    } as any);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'local-1' }),
    });
  });

  it('defaults a missing type to expense so the lookup cannot match the other type', async () => {
    const { service, prisma } = makeService({ findFirstResult: null });

    await service.create('acc-1', 'user-1', { name: 'Bonus' });

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', name: 'Bonus', type: 'expense' },
    });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'expense' }),
    });
  });
});

describe('CategoriesService.update', () => {
  it('throws NotFoundException when the category is neither owned by the account nor a system category', async () => {
    const { service, prisma } = makeService({ findFirstResult: null });

    await expect(service.update('acc-1', 'cat-x', { name: 'New' })).rejects.toThrow(NotFoundException);
    // `id` may be the server PK or the mobile's local clientId — one lookup
    // resolves either, scoped to the account's own rows + system categories.
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ accountId: 'acc-1' }, { isSystem: true }] },
          { OR: [{ id: 'cat-x' }, { clientId: 'cat-x' }] },
        ],
      },
    });
  });

  it('updates the resolved row and strips clientId out of the patch', async () => {
    // The mobile sends its local id as the path param and the row is matched by
    // clientId; `clientId` itself must never reach prisma.update (it is not
    // patchable and would be a needless write).
    const found = { id: 'server-1', clientId: 'local-1', name: 'Kawa' };
    const { service, prisma } = makeService({ findFirstResult: found });

    await service.update('acc-1', 'local-1', { name: 'Kawa i ciasto', clientId: 'local-1' } as any);

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'server-1' },
      data: { name: 'Kawa i ciasto' },
    });
  });

  it('refreshes the embedding only when the name actually changes', async () => {
    const { service, embeddingService } = makeService({ findFirstResult: { id: 'cat-1', name: 'Old Name' } });

    await service.update('acc-1', 'cat-1', { name: 'New Name' });

    expect(embeddingService.embedAndStore).toHaveBeenCalledWith('category', 'cat-1', 'New Name');
  });

  it('does not re-embed when name is unchanged or omitted', async () => {
    const { service, embeddingService } = makeService({ findFirstResult: { id: 'cat-1', name: 'Same' } });

    await service.update('acc-1', 'cat-1', { name: 'Same' });
    await service.update('acc-1', 'cat-1', { color: '#000' });

    expect(embeddingService.embedAndStore).not.toHaveBeenCalled();
  });

  it('invalidates the chat cache after a successful update', async () => {
    const { service, cacheService } = makeService({ findFirstResult: { id: 'cat-1', name: 'Same' } });

    await service.update('acc-1', 'cat-1', { color: '#000' });

    expect(cacheService.delByPrefix).toHaveBeenCalledWith('chat:get_category_breakdown:acc-1:');
  });

  // @@unique([accountId, name, type]) covers BOTH columns this PATCH can
  // change. `create` has guarded it since ABA-392; `update` never did and let
  // P2002 escape as a 500 (ABA-565).
  it('rejects a rename onto an existing category with 409 rather than letting P2002 escape', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const clash = { id: 'cat-2', name: 'Food', type: 'expense', isDeleted: false };
    const { service, prisma } = makeService({ findFirstResult: found, conflictResult: clash });

    await expect(service.update('acc-1', 'cat-1', { name: 'Food' })).rejects.toThrow(ConflictException);

    // Excluding the row being renamed is what keeps a no-op rename legal.
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', name: 'Food', type: 'expense', id: { not: 'cat-1' } },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('reports a soft-deleted clash distinctly, since the user cannot see that category', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const clash = { id: 'cat-2', name: 'Food', type: 'expense', isDeleted: true };
    const { service } = makeService({ findFirstResult: found, conflictResult: clash });

    // "Already exists" about a category the user deleted and cannot find is
    // the exact confusion ABA-392 called out, so the flag has to travel.
    await expect(service.update('acc-1', 'cat-1', { name: 'Food' })).rejects.toMatchObject({
      response: { details: { name: 'Food', type: 'expense', conflictIsDeleted: true } },
    });
  });

  it('checks the collision on a type switch too, not just a rename', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Bonus', type: 'expense' };
    const clash = { id: 'cat-2', name: 'Bonus', type: 'income', isDeleted: false };
    const { service, prisma } = makeService({ findFirstResult: found, conflictResult: clash });

    await expect(service.update('acc-1', 'cat-1', { type: 'income' })).rejects.toThrow(ConflictException);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', name: 'Bonus', type: 'income', id: { not: 'cat-1' } },
    });
  });

  it('does not probe at all when neither name nor type changes', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Same', type: 'expense' };
    const { service, prisma } = makeService({ findFirstResult: found });

    await service.update('acc-1', 'cat-1', { color: '#000' });

    const probes = prisma.category.findFirst.mock.calls.filter((c: any[]) => c[0]?.where?.id?.not);
    expect(probes).toHaveLength(0);
    expect(prisma.category.update).toHaveBeenCalled();
  });

  it('skips the probe for a system category, whose null accountId cannot trip the unique', async () => {
    // Postgres treats NULLs in a unique as distinct, so the constraint cannot
    // fire for a system row - probing would 409 where the DB would not.
    const found = { id: 'sys-1', accountId: null, name: 'Food', type: 'expense', isSystem: true };
    const { service, prisma } = makeService({ findFirstResult: found });

    await service.update('acc-1', 'sys-1', { name: 'Groceries' });

    const probes = prisma.category.findFirst.mock.calls.filter((c: any[]) => c[0]?.where?.id?.not);
    expect(probes).toHaveLength(0);
    expect(prisma.category.update).toHaveBeenCalled();
  });

  it('converts a racing P2002 into the same 409 instead of a 500', async () => {
    // A concurrent write can take the name between the probe and the update,
    // so the probe alone is not enough. Safe to catch: there is no
    // $transaction to poison (ABA-313), same backstop shape as create().
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const { service } = makeService({
      findFirstResult: found,
      conflictResult: null,
      updateError: Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    });

    await expect(service.update('acc-1', 'cat-1', { name: 'Food' })).rejects.toThrow(ConflictException);
  });

  it('still propagates a non-P2002 prisma failure', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const { service } = makeService({
      findFirstResult: found,
      updateError: Object.assign(new Error('connection lost'), { code: 'P1001' }),
    });

    await expect(service.update('acc-1', 'cat-1', { name: 'Food' })).rejects.toThrow('connection lost');
  });
});

describe('CategoriesService.remove', () => {
  it('throws NotFoundException when the category is not found', async () => {
    const { service } = makeService({ findFirstResult: null });

    await expect(service.remove('acc-1', 'cat-x')).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException with a breakdown when related records exist', async () => {
    const { service, prisma } = makeService({ findFirstResult: { id: 'cat-1' } });
    prisma.expense.count.mockResolvedValue(3);
    prisma.income.count.mockResolvedValue(1);

    await expect(service.remove('acc-1', 'cat-1')).rejects.toThrow(ConflictException);
    try {
      await service.remove('acc-1', 'cat-1');
    } catch (e: any) {
      expect(e.getResponse()).toEqual(
        expect.objectContaining({
          message: 'Category has related records',
          details: expect.objectContaining({ expenses: 3, incomes: 1 }),
        }),
      );
    }
  });

  it('soft-deletes when there are zero related records, and invalidates the chat cache', async () => {
    const { service, prisma, cacheService } = makeService({ findFirstResult: { id: 'cat-1' } });

    const result = await service.remove('acc-1', 'cat-1');

    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { isDeleted: true } });
    expect(cacheService.delByPrefix).toHaveBeenCalledWith('chat:get_expenses:acc-1:');
    expect(result).toEqual(expect.objectContaining({ id: 'cat-1', isDeleted: true }));
  });

  it('allows deleting a system category (soft-delete hides it for all accounts, per spec)', async () => {
    const { service, prisma } = makeService({ findFirstResult: { id: 'sys-cat', isSystem: true } });

    await service.remove('acc-1', 'sys-cat');

    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'sys-cat' }, data: { isDeleted: true } });
  });
});
