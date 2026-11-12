import { TransactionRevisionsService } from '../transaction-revisions/transaction-revisions.service';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseBulkService } from './expense-bulk.service';
import { ExpenseCrossAccountService } from './expense-cross-account.service';
import { BudgetAlertService } from '../budgets/budget-alert.service';
import { SharedActivityService } from '../notifications/shared-activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { TripArchivedGuard } from '../accounts/guards/trip-archived.guard';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

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
    update: jest.fn().mockResolvedValue({ id: 'exp-123', currencyCode: 'PLN' }),
    findOne: jest.fn(),
    create: jest.fn().mockResolvedValue({ expense: { id: 'exp-new' }, isNew: false }),
    getReceiptParts: jest.fn().mockResolvedValue([]),
    saveReceiptParts: jest.fn().mockResolvedValue({ success: true }),
  };
  const expenseBulkService = {
    bulkUpdate: jest.fn().mockResolvedValue({ updated: 2 }),
  };
  const expenseCrossAccountService = {
    mergeExpenses: jest.fn().mockResolvedValue({ keptId: 'a', mergedId: 'b' }),
    moveToAccount: jest.fn().mockResolvedValue({ id: 'exp-1', accountId: 'acc-2', categoryId: null }),
  };
  const budgetAlertService = {
    checkBudgetsForAccount: jest.fn().mockResolvedValue(undefined),
  };
  const sharedActivityService = {
    notifyExpenseCreated: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        { provide: ExpensesService, useValue: expensesService },
        { provide: ExpenseBulkService, useValue: expenseBulkService },
        { provide: ExpenseCrossAccountService, useValue: expenseCrossAccountService },
        { provide: BudgetAlertService, useValue: budgetAlertService },
        { provide: SharedActivityService, useValue: sharedActivityService },
        { provide: TransactionRevisionsService, useValue: { list: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(AccountContextGuard)
      .useValue(passThroughGuard)
      // TripArchivedGuard is DI-resolved (needs PrismaService) — this standalone
      // testing module doesn't wire up the database, so override it with a
      // trivial pass-through, same as the class-level guards above.
      .overrideGuard(TripArchivedGuard)
      .useValue({ canActivate: () => true })
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
    expect(expenseBulkService.bulkUpdate).toHaveBeenCalledTimes(1);
    const [accountIdArg, dtoArg] = expenseBulkService.bulkUpdate.mock.calls[0];
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
    expect(expenseBulkService.bulkUpdate).not.toHaveBeenCalled();
  });

  // Long receipt: the global pipe is whitelist + forbidNonWhitelisted, so the
  // create DTO must declare `receiptImageParts` or every multi-part save 400s.
  describe('receipt parts', () => {
    const img = Buffer.from('jpeg').toString('base64');
    const createBody = {
      localId: '11111111-1111-4111-8111-111111111111',
      amount: 8,
      currencyCode: 'PLN',
      date: '2026-11-01',
      source: 'ocr',
      receiptImageBase64: img,
      receiptImageParts: [{ imageBase64: img, mimeType: 'image/jpeg' }],
    };

    it('POST /expenses accepts receiptImageParts through the global ValidationPipe', async () => {
      const res = await request(app.getHttpServer()).post('/expenses').send(createBody);
      expect(res.status).toBe(201);
      expect(expensesService.create.mock.calls.at(-1)[2].receiptImageParts).toEqual([
        { imageBase64: img, mimeType: 'image/jpeg' },
      ]);
    });

    it('POST /expenses rejects 4 extra parts, a PDF part, and an unknown part field', async () => {
      const p = { imageBase64: img, mimeType: 'image/jpeg' };
      for (const receiptImageParts of [
        [p, p, p, p],
        [{ ...p, mimeType: 'application/pdf' }],
        [{ ...p, extra: 1 }],
      ]) {
        const res = await request(app.getHttpServer()).post('/expenses').send({ ...createBody, receiptImageParts });
        expect(res.status).toBe(400);
      }
    });

    it('GET /expenses/:id/receipt-parts routes with the account id', async () => {
      const res = await request(app.getHttpServer()).get('/expenses/local-1/receipt-parts');
      expect(res.status).toBe(200);
      expect(expensesService.getReceiptParts).toHaveBeenCalledWith('account-1', 'local-1', undefined);
    });

    it('GET /expenses/:id/receipt-parts?from=2 passes the filter through', async () => {
      const res = await request(app.getHttpServer()).get('/expenses/local-1/receipt-parts?from=2');
      expect(res.status).toBe(200);
      expect(expensesService.getReceiptParts).toHaveBeenLastCalledWith('account-1', 'local-1', 2);
    });

    it('PUT /expenses/:id/receipt-parts validates 1-4 parts and routes', async () => {
      const p = { imageBase64: img, mimeType: 'image/png' };
      const ok = await request(app.getHttpServer()).put('/expenses/local-1/receipt-parts').send({ parts: [p, p] });
      expect(ok.status).toBe(200);
      expect(expensesService.saveReceiptParts).toHaveBeenCalledWith('account-1', 'local-1', [p, p]);
      for (const parts of [[], [p, p, p, p, p]]) {
        const bad = await request(app.getHttpServer()).put('/expenses/local-1/receipt-parts').send({ parts });
        expect(bad.status).toBe(400);
      }
    });

    it('PUT /expenses/:id/receipt-parts is viewer-blocked', async () => {
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, ExpensesController.prototype.saveReceiptParts) ?? [];
      expect(guards.some((g) => g instanceof ViewerBlockGuard)).toBe(true);
    });
  });
});
