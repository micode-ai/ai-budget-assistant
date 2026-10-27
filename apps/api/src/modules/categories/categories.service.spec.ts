import { CategoriesService } from './categories.service';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';

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
      data: { accountId: 'acc-1', userId: 'user-1', name: 'Entertainment', icon: 'movie', color: '#123', type: 'expense', parentId: null, systemKey: 'entertainment' },
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

  // A system category has accountId: null and is global — RealSalaryService
  // reads coicopDivision account-wide, so letting any account's editor set it
  // on a system row would silently change every OTHER account's real-salary
  // weights. Every other field stays editable on a system category as before.
  it('rejects coicopDivision on a system category', async () => {
    const found = { id: 'sys-1', accountId: null, name: 'Food', type: 'expense', isSystem: true };
    const { service, prisma } = makeService({ findFirstResult: found });

    await expect(service.update('acc-1', 'sys-1', { coicopDivision: 'CP01' })).rejects.toThrow(ForbiddenException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('allows coicopDivision on an account category', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const { service, prisma } = makeService({ findFirstResult: found });

    await service.update('acc-1', 'cat-1', { coicopDivision: 'CP01' });

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { coicopDivision: 'CP01', coicopSource: 'user' },
    });
  });

  // ABA-617: a hand-picked division is marked 'user' so no later
  // reclassification pass may treat it as a model answer and overwrite it.
  it('marks a user-cleared division as user-set too', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const { service, prisma } = makeService({ findFirstResult: found });

    await service.update('acc-1', 'cat-1', { coicopDivision: 'TOTAL' });

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { coicopDivision: 'TOTAL', coicopSource: 'user' },
    });
  });

  it('leaves coicopSource alone when the PATCH does not touch coicopDivision', async () => {
    const found = { id: 'cat-1', accountId: 'acc-1', name: 'Groceries', type: 'expense' };
    const { service, prisma } = makeService({ findFirstResult: found });

    await service.update('acc-1', 'cat-1', { color: '#fff' });

    expect(prisma.category.update.mock.calls[0][0].data).not.toHaveProperty('coicopSource');
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

describe('CategoriesService parent validation (two-level hierarchy)', () => {
  // Parent lookups carry `OR: [{id},{clientId}]` + isDeleted:false; the target
  // category lookup is resolveCategory (AND form). Route them separately.
  function setup(opts: { parent?: any; target?: any; children?: number } = {}) {
    const ctx = makeService();
    ctx.prisma.category.findFirst.mockImplementation(({ where }: any) => {
      if (where?.AND) return Promise.resolve(opts.target ?? null);
      if (where?.OR && where?.accountId) return Promise.resolve(opts.parent ?? null);
      return Promise.resolve(null);
    });
    ctx.prisma.category.count.mockResolvedValue(opts.children ?? 0);
    return ctx;
  }
  const top = { id: 'p-1', clientId: 'p-local', accountId: 'acc-1', name: 'Food', type: 'expense', parentId: null };

  it('create stores the RESOLVED parent PK when given a clientId', async () => {
    const { service, prisma } = setup({ parent: top });
    await service.create('acc-1', 'user-1', { name: 'Cafe', type: 'expense', parentId: 'p-local' });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', isDeleted: false, OR: [{ id: 'p-local' }, { clientId: 'p-local' }] },
    });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ parentId: 'p-1' }),
    });
  });

  it.each([
    ['the parent already has a parent', { ...top, parentId: 'root' }],
    ['the parent is in another account / missing', null],
    ['the parent type differs', { ...top, type: 'income' }],
    ['the parent is a deposit category', { ...top, name: 'Deposit' }],
  ])('create rejects when %s', async (_label, parent) => {
    const { service, prisma } = setup({ parent });
    await expect(
      service.create('acc-1', 'user-1', { name: 'Cafe', type: 'expense', parentId: 'p-1' }),
    ).rejects.toThrow('Invalid parent category');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('accepts an income parent for an income category', async () => {
    const { service, prisma } = setup({ parent: { ...top, type: 'income', name: 'Salary' } });
    await service.create('acc-1', 'user-1', { name: 'Bonus', type: 'income', parentId: 'p-local' });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ parentId: 'p-1' }),
    });
  });

  it('rejects an expense parent for an income category', async () => {
    const { service, prisma } = setup({ parent: top });
    await expect(
      service.create('acc-1', 'user-1', { name: 'Bonus', type: 'income', parentId: 'p-1' }),
    ).rejects.toThrow('Invalid parent category');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('update rejects giving a parent to a category with live children', async () => {
    const target = { id: 'cat-1', accountId: 'acc-1', name: 'Mid', type: 'expense', parentId: null };
    const { service, prisma } = setup({ parent: top, target, children: 2 });
    await expect(service.update('acc-1', 'cat-1', { parentId: 'p-1' })).rejects.toThrow('Invalid parent category');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('update rejects parentId equal to its own id', async () => {
    const target = { id: 'p-1', accountId: 'acc-1', name: 'Food', type: 'expense', parentId: null };
    const { service, prisma } = setup({ parent: top, target });
    await expect(service.update('acc-1', 'p-1', { parentId: 'p-1' })).rejects.toThrow('Invalid parent category');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('update writes the resolved parent PK', async () => {
    const target = { id: 'cat-1', accountId: 'acc-1', name: 'Cafe', type: 'expense', parentId: null };
    const { service, prisma } = setup({ parent: top, target });
    await service.update('acc-1', 'cat-1', { parentId: 'p-local' });
    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { parentId: 'p-1' } });
  });

  it('update with parentId null clears it', async () => {
    const target = { id: 'cat-1', accountId: 'acc-1', name: 'Cafe', type: 'expense', parentId: 'p-1' };
    const { service, prisma } = setup({ target });
    await service.update('acc-1', 'cat-1', { parentId: null });
    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { parentId: null } });
  });

  it('update without the field leaves parentId untouched', async () => {
    const target = { id: 'cat-1', accountId: 'acc-1', name: 'Cafe', type: 'expense', parentId: 'p-1' };
    const { service, prisma } = setup({ target });
    await service.update('acc-1', 'cat-1', { color: '#000' });
    expect(prisma.category.update.mock.calls[0][0].data).not.toHaveProperty('parentId');
  });

  it('create rejects a deposit category becoming a child', async () => {
    const { service, prisma } = setup({ parent: top });
    await expect(
      service.create('acc-1', 'user-1', { name: 'Deposit', type: 'expense', parentId: 'p-1' }),
    ).rejects.toThrow('Invalid parent category');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('update rejects giving a parent to a system category (cross-tenant)', async () => {
    const target = { id: 'sys-1', accountId: null, name: 'Cafe', type: 'expense', parentId: null };
    const { service, prisma } = setup({ parent: top, target });
    await expect(service.update('acc-1', 'sys-1', { parentId: 'p-1' })).rejects.toThrow('Invalid parent category');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('update rejects giving a parent to a deposit category', async () => {
    const target = { id: 'cat-1', accountId: 'acc-1', name: 'Deposit', type: 'expense', parentId: null };
    const { service, prisma } = setup({ parent: top, target });
    await expect(service.update('acc-1', 'cat-1', { parentId: 'p-1' })).rejects.toThrow('Invalid parent category');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('revive writes the resolved parent PK', async () => {
    const { service, prisma } = setup({ parent: top });
    prisma.category.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.OR && where?.isDeleted === false
          ? top
          : { id: 'cat-old', name: 'Cafe', type: 'expense', isDeleted: true },
      ),
    );
    await service.create('acc-1', 'user-1', { name: 'Cafe', type: 'expense', parentId: 'p-local' });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-old' },
      data: expect.objectContaining({ isDeleted: false, parentId: 'p-1' }),
    });
  });

  it('revive rejects a deposit category becoming a child', async () => {
    const { service, prisma } = setup({ parent: top });
    prisma.category.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.OR && where?.isDeleted === false
          ? top
          : { id: 'cat-old', name: 'Deposit', type: 'expense', isDeleted: true },
      ),
    );
    await expect(
      service.create('acc-1', 'user-1', { name: 'Deposit', type: 'expense', parentId: 'p-1' }),
    ).rejects.toThrow('Invalid parent category');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});

describe('CategoriesService — system keys', () => {
  it('create of a catalog name returns the account\'s keyed row in another language', async () => {
    const keyed = { id: 'k1', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries', isDeleted: false };
    const { service, prisma } = makeService();
    prisma.category.findMany.mockResolvedValue([keyed]);

    const result = await service.create('acc-1', 'user-1', { name: 'Groceries', type: 'expense' });

    expect(result).toBe(keyed);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('create of a catalog name on an empty account stores the key', async () => {
    const { service, prisma } = makeService();
    await service.create('acc-1', 'user-1', { name: 'Zakupy spożywcze', type: 'expense' });
    expect(prisma.category.create.mock.calls[0][0].data.systemKey).toBe('groceries');
  });

  it('create of a non-catalog name stores no key', async () => {
    const { service, prisma } = makeService();
    await service.create('acc-1', 'user-1', { name: 'Piwo', type: 'expense' });
    expect(prisma.category.create.mock.calls[0][0].data.systemKey).toBeNull();
  });

  it('create ignores a client-sent systemKey', async () => {
    const { service, prisma } = makeService();
    await service.create('acc-1', 'user-1', { name: 'Piwo', type: 'expense', systemKey: 'alcohol', nameCustomized: true });
    const data = prisma.category.create.mock.calls[0][0].data;
    expect(data.systemKey).toBeNull();
    expect(data.nameCustomized).toBeUndefined();
  });

  it('P2002 on the key index re-reads the winner', async () => {
    const winner = { id: 'w', name: 'Groceries', type: 'expense', systemKey: 'groceries', isDeleted: false };
    const { service, prisma } = makeService();
    prisma.category.create.mockRejectedValue({ code: 'P2002' });
    prisma.category.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([winner]);

    await expect(service.create('acc-1', 'user-1', { name: 'Zakupy spożywcze', type: 'expense' })).resolves.toBe(winner);
  });

  it('rename of a keyed row sets nameCustomized without any new field', async () => {
    const { service, prisma } = makeService({
      findFirstResult: { id: 'k1', accountId: 'acc-1', name: 'Groceries', type: 'expense', systemKey: 'groceries' },
    });
    await service.update('acc-1', 'k1', { name: 'Food shop' });
    expect(prisma.category.update.mock.calls[0][0].data).toEqual({ name: 'Food shop', nameCustomized: true });
  });

  it('a colour-only edit or a rename of a keyless row leaves nameCustomized alone', async () => {
    const keyed = { id: 'k1', accountId: 'acc-1', name: 'Groceries', type: 'expense', systemKey: 'groceries' };
    const a = makeService({ findFirstResult: keyed });
    await a.service.update('acc-1', 'k1', { name: 'Groceries', color: '#fff' });
    expect(a.prisma.category.update.mock.calls[0][0].data.nameCustomized).toBeUndefined();
    const b = makeService({ findFirstResult: { ...keyed, systemKey: null } });
    await b.service.update('acc-1', 'k1', { name: 'Other' });
    expect(b.prisma.category.update.mock.calls[0][0].data.nameCustomized).toBeUndefined();
  });

  it('update with systemKey in the body leaves the key unchanged', async () => {
    const { service, prisma } = makeService({
      findFirstResult: { id: 'k1', accountId: 'acc-1', name: 'Groceries', type: 'expense', systemKey: 'groceries' },
    });
    await service.update('acc-1', 'k1', { color: '#000', systemKey: 'alcohol', nameCustomized: false });
    const data = prisma.category.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('systemKey');
    expect(data).not.toHaveProperty('nameCustomized');
  });

  it('create returns the live keyed row even when a soft-deleted keyed row has the exact name', async () => {
    const deleted = { id: 'd', name: 'Groceries', type: 'expense', systemKey: 'groceries', isDeleted: true };
    const live = { id: 'l', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries', isDeleted: false };
    const { service, prisma } = makeService({ findFirstResult: deleted });
    prisma.category.findMany.mockResolvedValue([live]);

    await expect(service.create('acc-1', 'user-1', { name: 'Groceries', type: 'expense' })).resolves.toBe(live);
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('create prefers the live keyed row over a live keyless duplicate with the exact name', async () => {
    const keyless = { id: 'a', name: 'Groceries', type: 'expense', systemKey: null, isDeleted: false };
    const keyed = { id: 'b', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries', isDeleted: false };
    const { service, prisma } = makeService({ findFirstResult: keyless });
    prisma.category.findMany.mockResolvedValue([keyless, keyed]);
    await expect(service.create('acc-1', 'user-1', { name: 'Groceries', type: 'expense' })).resolves.toBe(keyed);
  });

  it('reviving a deleted row that collides on the key returns the live winner instead of a 500', async () => {
    const deleted = { id: 'd', name: 'Groceries', type: 'expense', systemKey: 'groceries', isDeleted: true };
    const winner = { id: 'w', name: 'Zakupy spożywcze', type: 'expense', systemKey: 'groceries', isDeleted: false };
    const { service, prisma } = makeService({ findFirstResult: deleted, updateError: { code: 'P2002' } });
    prisma.category.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([winner]);
    await expect(service.create('acc-1', 'user-1', { name: 'Groceries', type: 'expense' })).resolves.toBe(winner);
  });

  it('a type change on a keyed row clears the key and nameCustomized', async () => {
    const { service, prisma } = makeService({
      findFirstResult: { id: 'k1', accountId: 'acc-1', name: 'Gifts', type: 'expense', systemKey: 'gifts', nameCustomized: true },
    });
    await service.update('acc-1', 'k1', { type: 'income' });
    expect(prisma.category.update.mock.calls[0][0].data).toMatchObject({ type: 'income', systemKey: null, nameCustomized: false });
  });
});
