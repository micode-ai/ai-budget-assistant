import { Test } from '@nestjs/testing';
import { ShoppingListService } from './shopping-list.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      shoppingList: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
      shoppingListItem: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
    prisma.shoppingListItem.updateMany.mockResolvedValue({ count: 3 });
    const res = await service.clearChecked('a1', 'l1');
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: 'a1', shoppingListId: 'l1', isChecked: true, isDeleted: false }) }),
    );
    expect(res.cleared).toBe(3);
  });
});
