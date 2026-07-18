import { CategoriesService } from './categories.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

function makeService(overrides: {
  findFirstResult?: any;
} = {}) {
  const category = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(overrides.findFirstResult ?? null),
    update: jest
      .fn()
      .mockImplementation(({ where, data }: any) =>
        Promise.resolve({ ...(overrides.findFirstResult ?? {}), id: where.id, ...data }),
      ),
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

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', name: 'Groceries', type: 'expense', isDeleted: true },
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
});

describe('CategoriesService.update', () => {
  it('throws NotFoundException when the category is neither owned by the account nor a system category', async () => {
    const { service, prisma } = makeService({ findFirstResult: null });

    await expect(service.update('acc-1', 'cat-x', { name: 'New' })).rejects.toThrow(NotFoundException);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-x', OR: [{ accountId: 'acc-1' }, { isSystem: true }] },
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
