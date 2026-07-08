import { Test } from '@nestjs/testing';
import { ShoppingListService } from './shopping-list.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      shoppingList: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
      shoppingListItem: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
      expenseItem: { findMany: jest.fn() },
      productAlias: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [ShoppingListService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ShoppingListService);
  });

  it('auto-creates a default list when the account has none', async () => {
    prisma.shoppingList.findMany.mockResolvedValue([]);
    prisma.shoppingList.upsert.mockResolvedValue({
      id: 'l1', accountId: 'a1', clientId: 'default-a1', name: 'My List',
      isDefault: true, isArchived: false, sortOrder: 0, createdByUserId: 'u1', items: [],
    });
    const lists = await service.getLists('a1', 'u1');
    expect(prisma.shoppingList.upsert).toHaveBeenCalled();
    expect(lists[0].isDefault).toBe(true);
  });

  it('getLists returns archived lists (not just the active default) so cross-device archive is not mistaken for delete', async () => {
    prisma.shoppingList.findMany.mockResolvedValue([
      {
        id: 'l1', accountId: 'a1', clientId: 'c1', name: 'Old',
        isDefault: false, isArchived: true, sortOrder: 0, createdByUserId: 'u1', items: [],
      },
    ]);
    prisma.shoppingList.upsert.mockResolvedValue({
      id: 'l2', accountId: 'a1', clientId: 'default-a1', name: 'My List',
      isDefault: true, isArchived: false, sortOrder: 0, createdByUserId: 'u1', items: [],
    });
    const res = await service.getLists('a1', 'u1');
    expect(res.some((l) => l.isArchived)).toBe(true);
    expect(prisma.shoppingList.upsert).toHaveBeenCalled();
  });

  it('getLists upserts the default list with an un-archive update (resurrects an archived/colliding default instead of crashing)', async () => {
    prisma.shoppingList.findMany.mockResolvedValue([]);
    prisma.shoppingList.upsert.mockResolvedValue({
      id: 'l1', accountId: 'a1', clientId: 'default-a1', name: 'My List',
      isDefault: true, isArchived: false, sortOrder: 0, createdByUserId: 'u1', items: [],
    });
    const lists = await service.getLists('a1', 'u1');
    expect(prisma.shoppingList.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_clientId: { accountId: 'a1', clientId: 'default-a1' } },
        update: expect.objectContaining({ isArchived: false, isDeleted: false }),
      }),
    );
    expect(lists[0].isDefault).toBe(true);
  });

  it('getLists de-dupes when the resurrected default list collides with an already-archived row of the same id', async () => {
    prisma.shoppingList.findMany.mockResolvedValue([
      {
        id: 'l1', accountId: 'a1', clientId: 'default-a1', name: 'My List',
        isDefault: true, isArchived: true, sortOrder: 0, createdByUserId: 'u1', items: [],
      },
    ]);
    prisma.shoppingList.upsert.mockResolvedValue({
      id: 'l1', accountId: 'a1', clientId: 'default-a1', name: 'My List',
      isDefault: true, isArchived: false, sortOrder: 0, createdByUserId: 'u1', items: [],
    });
    const res = await service.getLists('a1', 'u1');
    expect(res.filter((l) => l.id === 'l1').length).toBe(1);
    expect(res.find((l) => l.id === 'l1')?.isArchived).toBe(false);
  });

  it('createList idempotent replay returns the existing list WITH its items, not an empty array', async () => {
    prisma.shoppingList.findUnique.mockResolvedValue({
      id: 'l1', accountId: 'a1', clientId: 'c1', name: 'Weekly',
      isDefault: false, isArchived: false, sortOrder: 0, createdByUserId: 'u1',
      items: [{ id: 'i1', shoppingListId: 'l1', clientId: 'ci1', canonicalName: null, rawLabel: 'Milk', quantity: 1, note: null, isChecked: false, addedByUserId: 'u1', sortOrder: 0 }],
    });
    const list = await service.createList('a1', 'u1', { clientId: 'c1', name: 'Weekly' });
    expect(prisma.shoppingList.create).not.toHaveBeenCalled();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].rawLabel).toBe('Milk');
  });

  it('addItem is idempotent on clientId', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue({ id: 'l1', accountId: 'a1' });
    prisma.shoppingListItem.findUnique.mockResolvedValue({
      id: 'i1', shoppingListId: 'l1', clientId: 'c1', canonicalName: null, rawLabel: 'Milk',
      quantity: 1, note: null, isChecked: false, addedByUserId: 'u1', sortOrder: 0,
    });
    const item = await service.addItem('a1', 'u1', 'l1', { clientId: 'c1', rawLabel: 'Milk' });
    expect(prisma.shoppingListItem.create).not.toHaveBeenCalled();
    expect(item.id).toBe('i1');
  });

  it('clearChecked soft-deletes checked items scoped to account+list', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue({ id: 'l1', accountId: 'a1' });
    prisma.shoppingListItem.updateMany.mockResolvedValue({ count: 3 });
    const res = await service.clearChecked('a1', 'l1');
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: 'a1', shoppingListId: 'l1', isChecked: true, isDeleted: false }) }),
    );
    expect(res.cleared).toBe(3);
  });

  it('clearChecked returns zero without touching items when the list cannot be resolved', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue(null);
    const res = await service.clearChecked('a1', 'missing');
    expect(prisma.shoppingListItem.updateMany).not.toHaveBeenCalled();
    expect(res.cleared).toBe(0);
  });

  it('updateItem resolves an item by its clientId', async () => {
    prisma.shoppingListItem.findFirst.mockResolvedValue({ id: 'srv-item', accountId: 'a1' });
    prisma.shoppingListItem.update.mockResolvedValue({
      id: 'srv-item', shoppingListId: 'l1', clientId: 'client-item', canonicalName: null,
      rawLabel: 'Milk', quantity: 2, note: null, isChecked: true, addedByUserId: 'u1', sortOrder: 0,
    });
    const item = await service.updateItem('a1', 'client-item', { isChecked: true, quantity: 2 } as any);
    expect(prisma.shoppingListItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ id: 'client-item' }, { clientId: 'client-item' }] }) }),
    );
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'srv-item' } }));
    expect(item.id).toBe('srv-item');
  });

  it('addItem resolves the parent list by its clientId', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue({ id: 'srv-list', accountId: 'a1' });
    prisma.shoppingListItem.findUnique.mockResolvedValue(null);
    prisma.shoppingListItem.create.mockImplementation(({ data }: any) => Promise.resolve({
      id: 'i1', shoppingListId: data.shoppingListId, clientId: data.clientId, canonicalName: null,
      rawLabel: data.rawLabel, quantity: data.quantity, note: null, isChecked: false, addedByUserId: 'u1', sortOrder: 0,
    }));
    const item = await service.addItem('a1', 'u1', 'client-list', { clientId: 'c1', rawLabel: 'Milk' });
    expect(prisma.shoppingList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ id: 'client-list' }, { clientId: 'client-list' }] }) }),
    );
    expect(item.shoppingListId).toBe('srv-list');
  });

  it('deleteList scopes the child item soft-delete to the resolved list id when passed a clientId', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue({ id: 'srv-list', accountId: 'a1' });
    prisma.$transaction.mockResolvedValue([]);
    await service.deleteList('a1', 'client-list');
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shoppingListId: 'srv-list' }) }),
    );
  });

  it('getRestockSuggestions returns due products excluding those already on a list', async () => {
    prisma.productAlias.findMany.mockResolvedValue([]);
    prisma.expenseItem.findMany.mockResolvedValue([
      { canonicalName: 'Milk', expense: { date: new Date('2026-06-07') } },
      { canonicalName: 'Milk', expense: { date: new Date('2026-06-14') } },
      { canonicalName: 'Milk', expense: { date: new Date('2026-06-21') } },
      { canonicalName: 'Bread', expense: { date: new Date('2026-06-01') } },
      { canonicalName: 'Bread', expense: { date: new Date('2026-06-08') } },
      { canonicalName: 'Bread', expense: { date: new Date('2026-06-15') } },
    ]);
    // Bread is already on a list → excluded
    prisma.shoppingListItem.findMany.mockResolvedValue([{ canonicalName: 'Bread' }]);
    const res = await service.getRestockSuggestions('a1');
    expect(res.every((s) => s.canonicalName !== 'Bread')).toBe(true);
  });

  it('getDeals flags a recent price drop', async () => {
    prisma.productAlias.findMany.mockResolvedValue([]);
    prisma.expenseItem.findMany.mockResolvedValue([
      { canonicalName: 'Milk', unitPrice: 5, quantity: 1, totalPrice: 5, expense: { date: new Date('2026-05-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
      { canonicalName: 'Milk', unitPrice: 5, quantity: 1, totalPrice: 5, expense: { date: new Date('2026-06-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
      { canonicalName: 'Milk', unitPrice: 3.5, quantity: 1, totalPrice: 3.5, expense: { date: new Date(Date.now() - 3 * 86400000), merchant: 'Lidl', currencyCode: 'PLN' } },
    ]);
    const deals = await service.getDeals('a1');
    expect(deals.some((x) => x.canonicalName === 'Milk')).toBe(true);
  });
});
