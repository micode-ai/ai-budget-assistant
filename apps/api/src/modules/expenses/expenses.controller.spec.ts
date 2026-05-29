import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { BudgetAlertService } from '../budgets/budget-alert.service';
import { SharedActivityService } from '../notifications/shared-activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';

// Authenticate + attach account context so the class guards and the inline
// ViewerBlockGuard let the request through to the handler.
const passThroughGuard: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 'user-1' };
    req.accountId = 'account-1';
    req.accountRole = 'owner';
    return true;
  },
};

describe('ExpensesController routing', () => {
  let app: INestApplication;
  const expensesService = {
    bulkUpdate: jest.fn().mockResolvedValue({ updated: 2 }),
    update: jest.fn().mockResolvedValue({ id: 'exp-123', currencyCode: 'PLN' }),
    findOne: jest.fn(),
  };
  const budgetAlertService = {
    checkBudgetsForAccount: jest.fn().mockResolvedValue(undefined),
    checkSpendingAnomalies: jest.fn().mockResolvedValue(undefined),
  };
  const sharedActivityService = {
    notifyExpenseCreated: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        { provide: ExpensesService, useValue: expensesService },
        { provide: BudgetAlertService, useValue: budgetAlertService },
        { provide: SharedActivityService, useValue: sharedActivityService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountContextGuard)
      .useValue(passThroughGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror the production global pipe (main.ts) so routing + validation match prod.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // Regression for the bulk-delete bug: `@Patch('bulk')` was declared AFTER
  // `@Patch(':id')`, so Express routed PATCH /expenses/bulk to update() with
  // id="bulk". The bulk delete never persisted server-side and the expenses
  // reappeared on the next sync pull. The static route must win.
  it('PATCH /expenses/bulk routes to bulkUpdate (not update with id="bulk")', async () => {
    const res = await request(app.getHttpServer())
      .patch('/expenses/bulk')
      .send({ ids: ['a', 'b'], isDeleted: true });

    expect(res.status).toBe(200);
    expect(expensesService.bulkUpdate).toHaveBeenCalledTimes(1);
    const [accountIdArg, dtoArg] = expensesService.bulkUpdate.mock.calls[0];
    expect(accountIdArg).toBe('account-1');
    expect(dtoArg).toMatchObject({ ids: ['a', 'b'], isDeleted: true });
    expect(expensesService.update).not.toHaveBeenCalled();
  });

  it('PATCH /expenses/:id still routes to update for a real id', async () => {
    const res = await request(app.getHttpServer())
      .patch('/expenses/exp-123')
      .send({ amount: 10 });

    expect(res.status).toBe(200);
    expect(expensesService.update).toHaveBeenCalledTimes(1);
    expect(expensesService.update.mock.calls[0][1]).toBe('exp-123');
    expect(expensesService.bulkUpdate).not.toHaveBeenCalled();
  });
});
