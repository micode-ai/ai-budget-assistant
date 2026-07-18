import { Test } from '@nestjs/testing';
import { MerchantRulesController } from './merchant-rules.controller';
import { MerchantRulesService } from './merchant-rules.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';

describe('MerchantRulesController', () => {
  let controller: MerchantRulesController;
  let svc: { listRules: jest.Mock; deleteRule: jest.Mock };

  const req = { accountId: 'acc1' } as any;

  // Pass-through guard that bypasses JWT and account-context validation
  const passThroughGuard = { canActivate: () => true };

  beforeEach(async () => {
    svc = {
      listRules: jest.fn().mockResolvedValue([]),
      deleteRule: jest.fn().mockResolvedValue(undefined),
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
});
