import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { IncomesController } from './incomes.controller';
import { IncomesService } from './incomes.service';
import { IncomeBulkService } from './income-bulk.service';
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

describe('IncomesController routing', () => {
  let app: INestApplication;
  const incomesService = {
    update: jest.fn().mockResolvedValue({ id: 'inc-123', currencyCode: 'PLN' }),
    findOne: jest.fn(),
  };
  const incomeBulkService = {
    bulkUpdate: jest.fn().mockResolvedValue({ updated: 2 }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IncomesController],
      providers: [
        { provide: IncomesService, useValue: incomesService },
        { provide: IncomeBulkService, useValue: incomeBulkService },
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

  // Same route-ordering trap expenses.controller.spec.ts pins (ABA-166):
  // `@Patch('bulk')` must be declared BEFORE `@Patch(':id')`, or Express
  // routes PATCH /incomes/bulk to update() with id="bulk" and the bulk
  // update silently no-ops.
  it('PATCH /incomes/bulk routes to bulkUpdate (not update with id="bulk")', async () => {
    const res = await request(app.getHttpServer())
      .patch('/incomes/bulk')
      .send({ ids: ['a', 'b'], categoryId: 'cat-1' });

    expect(res.status).toBe(200);
    expect(incomeBulkService.bulkUpdate).toHaveBeenCalledTimes(1);
    const [accountIdArg, dtoArg] = incomeBulkService.bulkUpdate.mock.calls[0];
    expect(accountIdArg).toBe('account-1');
    expect(dtoArg).toMatchObject({ ids: ['a', 'b'], categoryId: 'cat-1' });
    expect(incomesService.update).not.toHaveBeenCalled();
  });

  it('PATCH /incomes/:id still routes to update for a real id', async () => {
    const res = await request(app.getHttpServer())
      .patch('/incomes/inc-123')
      .send({ amount: 10 });

    expect(res.status).toBe(200);
    expect(incomesService.update).toHaveBeenCalledTimes(1);
    expect(incomesService.update.mock.calls[0][1]).toBe('inc-123');
    expect(incomeBulkService.bulkUpdate).not.toHaveBeenCalled();
  });
});
