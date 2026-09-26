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

function mockRes() {
  const res: any = {};
  res.set = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

describe('ShoppingListGuestController', () => {
  it('guestPage renders the list name and items for a valid token', async () => {
    const { controller } = buildController();
    const html = await controller.guestPage('tok123', req);
    expect(html).toContain('Weekly groceries');
    expect(html).toContain('Milk');
    expect(html).toContain('Bread');
  });

  it('guestPage renders each item as one styled, fully clickable toggle button', async () => {
    const { controller } = buildController();
    const html = await controller.guestPage('tok123', req);
    expect(html).toContain('class="item-row"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('type="checkbox"');
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
    const res = mockRes();
    await controller.toggleItem('tok123', 'item-1', req, res);
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { isChecked: true, syncVersion: { increment: 1 } },
    });
  });

  it('toggleItem redirects back to the list so a refresh cannot toggle again', async () => {
    const { controller } = buildController();
    const res = mockRes();
    await controller.toggleItem('tok123', 'item-1', req, res);
    expect(res.redirect).toHaveBeenCalledWith(303, '/sl/tok123');
    expect(res.send).not.toHaveBeenCalled();
  });

  it('toggleItem ignores an itemId that does not belong to this list (IDOR guard)', async () => {
    const { controller, prisma } = buildController();
    await controller.toggleItem('tok123', 'item-from-another-list', req, mockRes());
    expect(prisma.shoppingListItem.update).not.toHaveBeenCalled();
  });

  it('toggleItem renders not-found for an unknown/revoked token, without touching the item', async () => {
    const { controller, prisma } = buildController();
    prisma.shoppingList.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await controller.toggleItem('dead-token', 'item-1', req, res);
    expect(res.send.mock.calls[0][0]).toContain('Link not available');
    expect(res.redirect).not.toHaveBeenCalled();
    expect(prisma.shoppingListItem.update).not.toHaveBeenCalled();
  });
});
