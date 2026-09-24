import 'reflect-metadata';
import { ShoppingListGuestController } from './shopping-list-guest.controller';

/**
 * Direct-construction style, mirroring receipt-split/guest.controller.spec.ts
 * — a lightweight Prisma mock, no TestingModule.
 */
function buildController(opts: {
  list?: any;
  items?: { id: string; rawLabel: string; quantity: unknown; isChecked: boolean }[];
} = {}) {
  const items = opts.items ?? [
    { id: 'item-1', rawLabel: 'Milk', quantity: 1, isChecked: false },
    { id: 'item-2', rawLabel: 'Bread', quantity: 2, isChecked: true },
  ];
  const list = opts.list ?? { id: 'list-1', name: 'Weekly groceries', items };

  const prisma: any = {
    shoppingList: {
      findFirst: jest.fn().mockResolvedValue(list),
    },
    shoppingListItem: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  const controller = new ShoppingListGuestController(prisma);
  return { controller, prisma, list };
}

const req: any = { query: {}, headers: {} };

describe('ShoppingListGuestController', () => {
  it('guestPage renders the list name and items for a valid token', async () => {
    const { controller } = buildController();
    const html = await controller.guestPage('tok123', req);
    expect(html).toContain('Weekly groceries');
    expect(html).toContain('Milk');
    expect(html).toContain('Bread');
  });

  it('guestPage renders the not-found page for an unknown token', async () => {
    const { controller, prisma } = buildController();
    prisma.shoppingList.findFirst.mockResolvedValue(null);
    const html = await controller.guestPage('unknown', req);
    expect(html).toContain('Link not available');
    expect(html).not.toContain('Weekly groceries');
  });

  it('guestPage never resolves an archived or deleted list (query is scoped, not a code-level filter after fetch)', async () => {
    const { controller, prisma } = buildController();
    await controller.guestPage('tok123', req);
    expect(prisma.shoppingList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ guestToken: 'tok123', isDeleted: false, isArchived: false }),
      }),
    );
  });

  it('toggleItem flips isChecked and persists with a syncVersion bump', async () => {
    const { controller, prisma } = buildController();
    const html = await controller.toggleItem('tok123', 'item-1', req);
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { isChecked: true, syncVersion: { increment: 1 } },
    });
    expect(html).toContain('Weekly groceries');
  });

  it('toggleItem ignores an itemId that does not belong to this list (IDOR guard)', async () => {
    const { controller, prisma } = buildController();
    await controller.toggleItem('tok123', 'item-from-another-list', req);
    expect(prisma.shoppingListItem.update).not.toHaveBeenCalled();
  });

  it('toggleItem renders not-found for an unknown/revoked token, without touching the item', async () => {
    const { controller, prisma } = buildController();
    prisma.shoppingList.findFirst.mockResolvedValue(null);
    const html = await controller.toggleItem('dead-token', 'item-1', req);
    expect(html).toContain('Link not available');
    expect(prisma.shoppingListItem.update).not.toHaveBeenCalled();
  });
});
