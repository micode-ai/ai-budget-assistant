import { Test } from '@nestjs/testing';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';

describe('ShoppingListController routing', () => {
  let controller: ShoppingListController;
  const svc = {
    getLists: jest.fn(), createList: jest.fn(), updateList: jest.fn(), deleteList: jest.fn(),
    addItem: jest.fn(), updateItem: jest.fn(), deleteItem: jest.fn(), clearChecked: jest.fn(),
  };
  // Pass-through guard that bypasses JWT and account-context validation (matches the
  // established pattern in other controller specs, e.g. family-feed.controller.spec.ts) —
  // AccountContextGuard depends on PrismaService, which isn't registered in this bare
  // testing module, so it must be overridden or module.compile() fails to resolve it.
  const passThroughGuard = { canActivate: () => true };
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ShoppingListController],
      providers: [{ provide: ShoppingListService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountContextGuard)
      .useValue(passThroughGuard)
      .compile();
    controller = mod.get(ShoppingListController);
  });

  it('addItem passes accountId+userId from req, not the body', async () => {
    const req: any = { accountId: 'a1', user: { id: 'u1' } };
    await controller.addItem(req, 'list-1', { clientId: 'c1', rawLabel: 'Milk' });
    expect(svc.addItem).toHaveBeenCalledWith('a1', 'u1', 'list-1', { clientId: 'c1', rawLabel: 'Milk' });
  });

  it('clearChecked resolves to the list id, not an item route', async () => {
    const req: any = { accountId: 'a1', user: { id: 'u1' } };
    await controller.clearChecked(req, 'list-1');
    expect(svc.clearChecked).toHaveBeenCalledWith('a1', 'list-1');
  });
});
