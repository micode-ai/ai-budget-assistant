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

  it('getLists returns archived lists WITHOUT resurrecting a default when all lists are archived (archive-to-empty-state)', async () => {
    // The account has one list, archived. The old behavior un-archived a default
    // here, which made an archived list "come back". Now getLists returns the
    // archived rows as-is and does NOT recreate a default — the client shows an
    // empty "create a list" state.
    prisma.shoppingList.findMany.mockResolvedValue([
      {
        id: 'l1', accountId: 'a1', clientId: 'c1', name: 'Old',
        isDefault: false, isArchived: true, sortOrder: 0, createdByUserId: 'u1', items: [],
      },
    ]);
    const res = await service.getLists('a1', 'u1');
    expect(res.some((l) => l.isArchived)).toBe(true);
    expect(prisma.shoppingList.upsert).not.toHaveBeenCalled();
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

  it('getLists does NOT un-archive the archived default when it is the only (archived) list', async () => {
    // The account's only list is an archived default. Archiving is an explicit
    // user action — getLists must leave it archived, not resurrect it.
    prisma.shoppingList.findMany.mockResolvedValue([
      {
        id: 'l1', accountId: 'a1', clientId: 'default-a1', name: 'My List',
        isDefault: true, isArchived: true, sortOrder: 0, createdByUserId: 'u1', items: [],
      },
    ]);
    const res = await service.getLists('a1', 'u1');
    expect(prisma.shoppingList.upsert).not.toHaveBeenCalled();
    expect(res.find((l) => l.id === 'l1')?.isArchived).toBe(true);
  });

  it('addItemsByName adds items to the existing active list', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue({ id: 'l1', accountId: 'a1', name: 'Groceries' });
    prisma.shoppingListItem.create.mockResolvedValue({});
    const res = await service.addItemsByName('a1', 'u1', ['Milk', '  Bread  ', '']);
    expect(prisma.shoppingList.upsert).not.toHaveBeenCalled();
    expect(prisma.shoppingListItem.create).toHaveBeenCalledTimes(2); // blank dropped
    expect(res.listName).toBe('Groceries');
    expect(res.addedLabels).toEqual(['Milk', 'Bread']); // trimmed
    const firstArgs = prisma.shoppingListItem.create.mock.calls[0][0];
    expect(firstArgs.data).toEqual(expect.objectContaining({ accountId: 'a1', shoppingListId: 'l1', rawLabel: 'Milk', quantity: 1, addedByUserId: 'u1' }));
    expect(typeof firstArgs.data.clientId).toBe('string');
  });

  it('addItemsByName revives/creates the default list when none is active (e.g. after archiving all)', async () => {
    prisma.shoppingList.findFirst.mockResolvedValue(null);
    prisma.shoppingList.upsert.mockResolvedValue({ id: 'def', accountId: 'a1', name: 'My List' });
    prisma.shoppingListItem.create.mockResolvedValue({});
    const res = await service.addItemsByName('a1', 'u1', ['Eggs']);
    expect(prisma.shoppingList.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_clientId: { accountId: 'a1', clientId: 'default-a1' } },
        update: expect.objectContaining({ isArchived: false, isDeleted: false }),
      }),
    );
    expect(res.listId).toBe('def');
    expect(res.addedLabels).toEqual(['Eggs']);
  });

  it('addItemsByName rejects an all-blank item list without touching the DB', async () => {
    await expect(service.addItemsByName('a1', 'u1', ['   ', ''])).rejects.toThrow();
    expect(prisma.shoppingList.findFirst).not.toHaveBeenCalled();
    expect(prisma.shoppingListItem.create).not.toHaveBeenCalled();
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
    prisma.shoppingListItem.findMany.mockResolvedValue([]);
    const deals = await service.getDeals('a1');
    expect(deals.some((x) => x.canonicalName === 'Milk')).toBe(true);
  });

  it('getDeals excludes deals for products already on a list', async () => {
    prisma.productAlias.findMany.mockResolvedValue([]);
    prisma.expenseItem.findMany.mockResolvedValue([
      { canonicalName: 'Milk', unitPrice: 5, quantity: 1, totalPrice: 5, expense: { date: new Date('2026-05-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
      { canonicalName: 'Milk', unitPrice: 5, quantity: 1, totalPrice: 5, expense: { date: new Date('2026-06-01'), merchant: 'Lidl', currencyCode: 'PLN' } },
      { canonicalName: 'Milk', unitPrice: 3.5, quantity: 1, totalPrice: 3.5, expense: { date: new Date(Date.now() - 3 * 86400000), merchant: 'Lidl', currencyCode: 'PLN' } },
    ]);
    // Milk is already on a list → its deal must be excluded
    prisma.shoppingListItem.findMany.mockResolvedValue([{ canonicalName: 'Milk' }]);
    const res = await service.getDeals('a1');
    expect(res.every((d) => d.canonicalName !== 'Milk')).toBe(true);
  });
});
