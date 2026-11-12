import { ChildrenController, ExpenseChildrenController } from './children.controller';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChildStatementDto } from './dto';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { REQUIRED_TIER_KEY } from '../subscriptions/decorators/require-tier.decorator';

/* eslint-disable @typescript-eslint/no-explicit-any */

const guardsOf = (target: any): unknown[] => Reflect.getMetadata('__guards__', target) ?? [];
const hasViewerBlock = (fn: any) => guardsOf(fn).some((g) => g instanceof ViewerBlockGuard);

describe('children controllers — guards', () => {
  it('both controllers require JwtAuthGuard then AccountContextGuard', () => {
    expect(guardsOf(ChildrenController)).toEqual([JwtAuthGuard, AccountContextGuard]);
    expect(guardsOf(ExpenseChildrenController)).toEqual([JwtAuthGuard, AccountContextGuard]);
  });

  it('viewer cannot write', () => {
    expect(hasViewerBlock(ChildrenController.prototype.create)).toBe(true);
    expect(hasViewerBlock(ChildrenController.prototype.update)).toBe(true);
    expect(hasViewerBlock(ExpenseChildrenController.prototype.setExpenseChildren)).toBe(true);
    expect(hasViewerBlock(ExpenseChildrenController.prototype.setItemChild)).toBe(true);
  });

  it('reads stay open to viewers', () => {
    expect(hasViewerBlock(ChildrenController.prototype.findAll)).toBe(false);
    expect(hasViewerBlock(ChildrenController.prototype.suggestions)).toBe(false);
  });

  it('PATCH item child answers 204', () => {
    expect(Reflect.getMetadata('__httpCode__', ExpenseChildrenController.prototype.setItemChild)).toBe(204);
  });
});

describe('POST /children/:id/statement — gates', () => {
  const handler = ChildrenController.prototype.statement;

  it('is Pro-gated, tier-guarded and viewer-blocked', () => {
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(REQUIRED_TIER_KEY, handler)).toBe('pro');
    expect(guardsOf(handler)).toContain(SubscriptionTierGuard);
    expect(hasViewerBlock(handler)).toBe(true);
  });

  it('free tier → 403 TIER_REQUIRED', async () => {
    const subscriptions = { getOrCreateSubscription: jest.fn().mockResolvedValue({ tier: 'free' }) };
    const guard = new SubscriptionTierGuard(new Reflector(), subscriptions as any);
    const context: any = {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
    };
    const err: any = await guard.canActivate(context).catch((e: unknown) => e);
    expect(err.getStatus()).toBe(403);
    expect(err.getResponse()).toEqual(expect.objectContaining({ code: 'TIER_REQUIRED' }));
  });

  it('pro tier passes the tier guard', async () => {
    const subscriptions = { getOrCreateSubscription: jest.fn().mockResolvedValue({ tier: 'pro' }) };
    const guard = new SubscriptionTierGuard(new Reflector(), subscriptions as any);
    const context: any = {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
    };
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('sends the PDF once through @Res()', async () => {
    const pdf = Buffer.from('%PDF-1.4');
    const statements = { generate: jest.fn().mockResolvedValue(pdf) };
    const controller = new ChildrenController({} as any, statements as any);
    const res: any = { setHeader: jest.fn(), send: jest.fn() };
    const req: any = { accountId: 'acc-1', user: { id: 'u1', currencyCode: 'PLN' } };
    await controller.statement(req, 'child-1', { from: '2026-01-01', to: '2026-06-30', locale: 'pl', currencyCode: 'EUR' } as any, res);
    // The report currency is the caller's display currency from the session, not the body.
    expect(statements.generate).toHaveBeenCalledWith('acc-1', 'child-1', '2026-01-01', '2026-06-30', 'PLN', 'pl');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(pdf);
  });
});

describe('ChildStatementDto', () => {
  const errors = (body: Record<string, unknown>) =>
    validateSync(plainToInstance(ChildStatementDto, body)).map((e) => e.property);

  it('accepts a supported currency and rejects anything else', () => {
    expect(errors({ from: '2026-01-01', to: '2026-02-01', currencyCode: 'PLN' })).toEqual([]);
    expect(errors({ from: '2026-01-01', to: '2026-02-01', currencyCode: 'XYZ' })).toEqual(['currencyCode']);
    expect(errors({ from: '2026-01-01', to: '2026-02-01' })).toEqual([]);
  });
});
