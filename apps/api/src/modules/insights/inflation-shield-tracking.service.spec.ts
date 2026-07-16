import { Prisma } from '@prisma/client';
import { InflationShieldTrackingService } from './inflation-shield-tracking.service';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' } as any);
}

describe('InflationShieldTrackingService.recordRecommendations', () => {
  const item = {
    canonicalName: 'Masło',
    currentPrice: 5.9,
    projectedPrice: 6.5,
    quantity: 2,
    projectedSaving: 0.6,
  };

  function make() {
    const prisma = {
      inflationShieldRecommendation: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return { svc: new InflationShieldTrackingService(prisma as any), prisma };
  }

  it('creates one active recommendation per item with the base-currency snapshot', async () => {
    const { svc, prisma } = make();
    await svc.recordRecommendations('a1', [item], 'PLN', new Date('2026-07-16T00:00:00Z'));
    expect(prisma.inflationShieldRecommendation.create).toHaveBeenCalledTimes(1);
    const arg = prisma.inflationShieldRecommendation.create.mock.calls[0][0];
    expect(arg.data).toEqual(
      expect.objectContaining({
        accountId: 'a1',
        canonicalName: 'Masło',
        periodMonth: '2026-07',
        priceAtRec: 5.9,
        projectedPrice: 6.5,
        qty: 2,
        projectedSaving: 0.6,
        currencyCode: 'PLN',
      }),
    );
  });

  it('swallows a P2002 duplicate (already recorded this product this month)', async () => {
    const { svc, prisma } = make();
    (prisma.inflationShieldRecommendation.create as jest.Mock).mockRejectedValueOnce(p2002());
    await expect(svc.recordRecommendations('a1', [item], 'PLN', new Date('2026-07-16'))).resolves.toBeUndefined();
  });

  it('rethrows a non-P2002 error', async () => {
    const { svc, prisma } = make();
    (prisma.inflationShieldRecommendation.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(svc.recordRecommendations('a1', [item], 'PLN', new Date('2026-07-16'))).rejects.toThrow('db down');
  });
});

describe('InflationShieldTrackingService.reconcilePurchase', () => {
  const activeRec = {
    id: 'r1', accountId: 'a1', canonicalName: 'Masło', qty: 4,
    projectedSaving: new Prisma.Decimal(2.0), recommendedAt: new Date('2026-07-01'),
  };

  function make(items: any[], recs = [activeRec]) {
    const prisma = {
      expense: { findFirst: jest.fn().mockResolvedValue({ id: 'e1', accountId: 'a1', date: new Date('2026-07-10'), items }) },
      inflationShieldRecommendation: {
        findMany: jest.fn().mockResolvedValue(recs),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { svc: new InflationShieldTrackingService(prisma as any), prisma };
  }

  it('marks a rec acted and credits proportional realized saving when a matching product is bought', async () => {
    // bought 2 of a recommended 4 → half the saving.
    const { svc, prisma } = make([{ canonicalName: 'Masło', quantity: new Prisma.Decimal(2) }]);
    await svc.reconcilePurchase('a1', 'e1');
    expect(prisma.inflationShieldRecommendation.update).toHaveBeenCalledTimes(1);
    const arg = prisma.inflationShieldRecommendation.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'r1' });
    expect(arg.data.status).toBe('acted');
    expect(arg.data.realizedSaving).toBeCloseTo(1.0, 5); // 2.0 * (2/4)
    expect(arg.data.actedAt).toBeInstanceOf(Date);
  });

  it('sums quantities across multiple receipt lines for the same product before matching', async () => {
    // Two 'Masło' lines of 2 each → 4 bought of a recommended 4 → full saving.
    const { svc, prisma } = make([
      { canonicalName: 'Masło', quantity: new Prisma.Decimal(2) },
      { canonicalName: 'Masło', quantity: new Prisma.Decimal(2) },
    ]);
    await svc.reconcilePurchase('a1', 'e1');
    expect(prisma.inflationShieldRecommendation.update).toHaveBeenCalledTimes(1);
    expect(prisma.inflationShieldRecommendation.update.mock.calls[0][0].data.realizedSaving).toBeCloseTo(2.0, 5);
  });

  it('does nothing when no bought item matches an active rec', async () => {
    const { svc, prisma } = make([{ canonicalName: 'Chleb', quantity: new Prisma.Decimal(1) }]);
    await svc.reconcilePurchase('a1', 'e1');
    expect(prisma.inflationShieldRecommendation.update).not.toHaveBeenCalled();
  });

  it('does nothing when the expense is not found', async () => {
    const prisma = {
      expense: { findFirst: jest.fn().mockResolvedValue(null) },
      inflationShieldRecommendation: { findMany: jest.fn(), update: jest.fn() },
    };
    const svc = new InflationShieldTrackingService(prisma as any);
    await svc.reconcilePurchase('a1', 'missing');
    expect(prisma.inflationShieldRecommendation.findMany).not.toHaveBeenCalled();
  });

  it('reconciles a purchase made the same calendar day as the recommendation (time-of-day ignored)', async () => {
    const sameDayRec = { ...activeRec, recommendedAt: new Date('2026-07-10T14:32:00Z') };
    const { svc, prisma } = make([{ canonicalName: 'Masło', quantity: new Prisma.Decimal(4) }], [sameDayRec]);
    await svc.reconcilePurchase('a1', 'e1');
    expect(prisma.inflationShieldRecommendation.update).toHaveBeenCalledTimes(1);
    const arg = prisma.inflationShieldRecommendation.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'r1' });
    expect(arg.data.status).toBe('acted');
  });
});

describe('InflationShieldTrackingService.getActedRecommendations', () => {
  it('returns realized savings with their currency for acted recs', async () => {
    const prisma = {
      inflationShieldRecommendation: {
        findMany: jest.fn().mockResolvedValue([{ realizedSaving: new Prisma.Decimal(1.5), currencyCode: 'PLN' }]),
      },
    };
    const svc = new InflationShieldTrackingService(prisma as any);
    const out = await svc.getActedRecommendations('a1');
    expect(out).toEqual([{ realizedSaving: 1.5, currencyCode: 'PLN' }]);
    expect(prisma.inflationShieldRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'a1', status: 'acted' } }),
    );
  });
});
