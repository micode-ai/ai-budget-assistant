import { Test } from '@nestjs/testing';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingListTemplateService } from './shopping-list-template.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';

describe('ShoppingListController routing', () => {
  let controller: ShoppingListController;
  const svc = {
    getLists: jest.fn(), createList: jest.fn(), updateList: jest.fn(), deleteList: jest.fn(),
    addItem: jest.fn(), updateItem: jest.fn(), deleteItem: jest.fn(), clearChecked: jest.fn(),
  };
  const templateSvc = {
    list: jest.fn(), create: jest.fn(), rename: jest.fn(), remove: jest.fn(), apply: jest.fn(),
  };
  // Pass-through guard that bypasses JWT and account-context validation (matches the
  // established pattern in other controller specs, e.g. family-feed.controller.spec.ts) —
  // AccountContextGuard depends on PrismaService, which isn't registered in this bare
  // testing module, so it must be overridden or module.compile() fails to resolve it.
  const passThroughGuard = { canActivate: () => true };
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ShoppingListController],
      providers: [
        { provide: ShoppingListService, useValue: svc },
        { provide: ShoppingListTemplateService, useValue: templateSvc },
      ],
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

  describe('templates routes (ABA-166 route-order: declared before :id)', () => {
    const req: any = { accountId: 'a1', user: { id: 'u1' } };

    it('getTemplates resolves to the list method, not the generic :id getter', async () => {
      await controller.getTemplates(req);
      expect(templateSvc.list).toHaveBeenCalledWith('a1');
    });

    it('createTemplate passes accountId+userId from req, not the body', async () => {
      const dto = { name: 'Weekly staples', items: [{ rawLabel: 'Milk' }] };
      await controller.createTemplate(req, dto as any);
      expect(templateSvc.create).toHaveBeenCalledWith('a1', 'u1', dto);
    });

    it('renameTemplate resolves templateId as its own param, not the list :id route', async () => {
      await controller.renameTemplate(req, 'tpl-1', { name: 'New name' });
      expect(templateSvc.rename).toHaveBeenCalledWith('a1', 'tpl-1', { name: 'New name' });
      expect(svc.updateList).not.toHaveBeenCalled();
    });

    it('deleteTemplate resolves templateId as its own param, not the list :id route', async () => {
      await controller.deleteTemplate(req, 'tpl-1');
      expect(templateSvc.remove).toHaveBeenCalledWith('a1', 'tpl-1');
      expect(svc.deleteList).not.toHaveBeenCalled();
    });

    it('applyTemplate passes templateId + listId from the body separately', async () => {
      await controller.applyTemplate(req, 'tpl-1', { listId: 'list-1' });
      expect(templateSvc.apply).toHaveBeenCalledWith('a1', 'u1', 'tpl-1', 'list-1');
    });
  });
});
