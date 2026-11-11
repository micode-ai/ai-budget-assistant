import { ForbiddenException } from '@nestjs/common';
import { LeafletBudgetService, LEAFLET_PAGE_LIMITS } from './leaflet-budget.service';

function make(sub: Record<string, any> = {}) {
  const state = {
    id: 'sub-1',
    userId: 'u1',
    tier: 'free',
    status: 'active',
    leafletPagesUsed: 0,
    aiRequestsUsed: 7,
    aiRequestsResetAt: new Date('2026-12-01T00:00:00Z'),
    ...sub,
  };
  const prisma: any = {
    subscription: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const lte = where.leafletPagesUsed?.lte;
        if (lte !== undefined && state.leafletPagesUsed > lte) return { count: 0 };
        if (data.leafletPagesUsed?.increment) state.leafletPagesUsed += data.leafletPagesUsed.increment;
        if (data.leafletPagesUsed?.decrement) state.leafletPagesUsed -= data.leafletPagesUsed.decrement;
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async () => state),
    },
  };
  const subs: any = {
    getOrCreateSubscription: jest.fn(async () => state),
    resetUsageIfNeeded: jest.fn().mockResolvedValue(undefined),
    recordAdditionalUsage: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new LeafletBudgetService(prisma, subs), prisma, subs, state };
}

describe('LeafletBudgetService', () => {
  it('limits are 20/200/500', () => {
    expect(LEAFLET_PAGE_LIMITS).toEqual({ free: 20, pro: 200, business: 500 });
  });

  it('free user at 19 can consume 1, at 20 gets LEAFLET_LIMIT', async () => {
    const { service, state } = make({ leafletPagesUsed: 19 });
    await service.consume('u1', 'a1');
    expect(state.leafletPagesUsed).toBe(20);
    await expect(service.consume('u1', 'a1')).rejects.toMatchObject({
      response: { code: 'LEAFLET_LIMIT' },
    });
    await expect(service.consume('u1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('business has 500, not unlimited', async () => {
    const { service, state } = make({ tier: 'business', leafletPagesUsed: 499 });
    await service.consume('u1', null);
    await expect(service.consume('u1', null)).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.leafletPagesUsed).toBe(500);
    expect((await service.get('u1')).limit).toBe(500);
  });

  it('refund never goes below 0', async () => {
    const { service, state } = make({ leafletPagesUsed: 1 });
    await service.refund('u1', 5);
    expect(state.leafletPagesUsed).toBe(0);
    await service.refund('u1', 1);
    expect(state.leafletPagesUsed).toBe(0);
  });

  it('consume does not touch aiRequestsUsed and logs COGS', async () => {
    const { service, prisma, subs, state } = make();
    await service.consume('u1', 'a1', 2);
    expect(state.aiRequestsUsed).toBe(7);
    for (const c of prisma.subscription.updateMany.mock.calls) {
      expect(c[0].data.aiRequestsUsed).toBeUndefined();
    }
    expect(subs.recordAdditionalUsage).toHaveBeenCalledWith('u1', 'leaflet', 2, 'a1');
    expect(subs.resetUsageIfNeeded).toHaveBeenCalled();
  });

  it('get returns used, limit and resetAt', async () => {
    const { service } = make({ tier: 'pro', leafletPagesUsed: 3 });
    expect(await service.get('u1')).toEqual({
      used: 3,
      limit: 200,
      resetAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('ignores customAiLimit and bonusAiRequests', async () => {
    const { service } = make({ customAiLimit: 9999, bonusAiRequests: 500 });
    expect((await service.get('u1')).limit).toBe(20);
  });
});
