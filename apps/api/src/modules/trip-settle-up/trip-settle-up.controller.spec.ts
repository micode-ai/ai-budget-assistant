import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import * as request from 'supertest';
import { TripSettleUpController } from './trip-settle-up.controller';
import { TripSettleUpService } from './trip-settle-up.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { TripArchivedGuard } from '../accounts/guards/trip-archived.guard';

// Authenticate + attach account context so the class-level guards let the request
// through to the handler (same pattern as expenses.controller.spec.ts).
const passThroughGuard: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 'user-1' };
    req.accountId = 'account-1';
    req.accountRole = 'owner';
    return true;
  },
};

// Simulates an archived trip: rejects exactly like the real TripArchivedGuard would
// when Account.tripStatus === 'archived'.
const archivedTripGuard: CanActivate = {
  canActivate: () => {
    throw new ForbiddenException('This trip is archived and can no longer be modified');
  },
};

describe('TripSettleUpController routing — TripArchivedGuard placement', () => {
  let app: INestApplication;
  const tripSettleUpService = {
    createPayment: jest.fn().mockResolvedValue({ id: 'txn-1' }),
    confirmPayment: jest.fn().mockResolvedValue({ id: 'txn-1', status: 'confirmed' }),
    getBalances: jest.fn().mockResolvedValue({}),
  };

  async function buildApp(tripArchivedOverride: CanActivate) {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TripSettleUpController],
      providers: [{ provide: TripSettleUpService, useValue: tripSettleUpService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountContextGuard)
      .useValue(passThroughGuard)
      .overrideGuard(TripArchivedGuard)
      .useValue(tripArchivedOverride)
      .compile();

    const application = moduleRef.createNestApplication();
    await application.init();
    return application;
  }

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) await app.close();
  });

  it('POST /accounts/:id/settle-up/pay is blocked with 403 once the trip is archived', async () => {
    app = await buildApp(archivedTripGuard);

    const res = await request(app.getHttpServer())
      .post('/accounts/account-1/settle-up/pay')
      .send({ fromUserId: 'user-1', toUserId: 'user-2', amount: 10 });

    expect(res.status).toBe(403);
    expect(tripSettleUpService.createPayment).not.toHaveBeenCalled();
  });

  it('POST /accounts/:id/settle-up/pay succeeds when the trip is not archived', async () => {
    app = await buildApp({ canActivate: () => true });

    const res = await request(app.getHttpServer())
      .post('/accounts/account-1/settle-up/pay')
      .send({ fromUserId: 'user-1', toUserId: 'user-2', amount: 10 });

    expect(res.status).toBe(201);
    expect(tripSettleUpService.createPayment).toHaveBeenCalledTimes(1);
  });

  it('PATCH /accounts/:id/settle-up/:txnId/confirm is NOT blocked by TripArchivedGuard — confirming a pending payment must not be strandable by archiving the trip', async () => {
    // Even though the override here would reject if TripArchivedGuard were applied
    // to this route, confirm() must still succeed — proving the guard is intentionally
    // absent from this handler.
    app = await buildApp(archivedTripGuard);

    const res = await request(app.getHttpServer()).patch('/accounts/account-1/settle-up/txn-1/confirm');

    expect(res.status).toBe(200);
    expect(tripSettleUpService.confirmPayment).toHaveBeenCalledWith('account-1', 'txn-1', 'user-1');
  });
});
