import { Test } from '@nestjs/testing';
import { MerchantRulesController } from './merchant-rules.controller';
import { MerchantRulesService } from './merchant-rules.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';

describe('MerchantRulesController', () => {
  let controller: MerchantRulesController;
  let svc: {
    listRules: jest.Mock;
    deleteRule: jest.Mock;
    previewReapply: jest.Mock;
    reapply: jest.Mock;
  };

  const req = { accountId: 'acc1' } as any;

  // Pass-through guard that bypasses JWT and account-context validation
  const passThroughGuard = { canActivate: () => true };

  beforeEach(async () => {
    svc = {
      listRules: jest.fn().mockResolvedValue([]),
      deleteRule: jest.fn().mockResolvedValue(undefined),
      previewReapply: jest.fn().mockResolvedValue({
        ruleId: 'rule1',
        merchantNormalized: 'biedronka',
        targetCategoryId: 'cat-target',
        targetCategoryName: 'Groceries',
        totalCount: 0,
        groups: [],
      }),
      reapply: jest.fn().mockResolvedValue({ updated: 0 }),
    };
    const module = await Test.createTestingModule({
      controllers: [MerchantRulesController],
      providers: [{ provide: MerchantRulesService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountContextGuard)
      .useValue(passThroughGuard)
      .compile();
    controller = module.get(MerchantRulesController);
  });

  it('GET /merchant-rules delegates to listRules with the account from the request', async () => {
    const result = await controller.listRules(req);
    expect(svc.listRules).toHaveBeenCalledWith('acc1');
    expect(result).toEqual([]);
  });

  it('DELETE /merchant-rules/:id delegates to deleteRule with the account and rule id', async () => {
    await controller.deleteRule(req, 'rule1');
    expect(svc.deleteRule).toHaveBeenCalledWith('acc1', 'rule1');
  });

  it('GET /merchant-rules/:id/reapply-preview delegates to previewReapply with the account and rule id', async () => {
    const result = await controller.previewReapply(req, 'rule1');
    expect(svc.previewReapply).toHaveBeenCalledWith('acc1', 'rule1');
    expect(result).toEqual({
      ruleId: 'rule1',
      merchantNormalized: 'biedronka',
      targetCategoryId: 'cat-target',
      targetCategoryName: 'Groceries',
      totalCount: 0,
      groups: [],
    });
  });

  it('POST /merchant-rules/:id/reapply delegates to reapply with the account, rule id and selected category ids', async () => {
    const result = await controller.reapply(req, 'rule1', { categoryIds: ['cat-a', 'cat-b'] });
    expect(svc.reapply).toHaveBeenCalledWith('acc1', 'rule1', ['cat-a', 'cat-b']);
    expect(result).toEqual({ updated: 0 });
  });

  it('the reapply route is guarded by ViewerBlockGuard', () => {
    const guards = Reflect.getMetadata('__guards__', MerchantRulesController.prototype.reapply);
    expect(guards).toBeDefined();
    expect(guards.some((g: any) => (g?.constructor?.name ?? g?.name) === 'ViewerBlockGuard')).toBe(true);
  });
});
