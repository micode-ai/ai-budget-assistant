import { AdminService } from './admin.service';

function makePrisma(rows: any[] = []) {
  return {
    user: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  } as any;
}

const cache = { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any;
const base = { page: 1, limit: 20 };

function whereOf(prisma: any) {
  return prisma.user.findMany.mock.calls[0][0].where;
}

describe('AdminService.getUsers — comped flagging and billing filter', () => {
  it('builds no subscription filter when neither tier nor billing is given', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache).getUsers({ ...base });
    expect(whereOf(prisma).subscription).toBeUndefined();
  });

  it('filters to admin-granted subscriptions on billing=comped', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache).getUsers({ ...base, billing: 'comped' });
    expect(whereOf(prisma).subscription).toEqual({
      tier: { in: ['pro', 'business'] },
      status: 'active',
      stripeSubscriptionId: null,
    });
  });

  it('filters to Stripe-backed subscriptions on billing=paying', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache).getUsers({ ...base, billing: 'paying' });
    expect(whereOf(prisma).subscription).toEqual({
      tier: { in: ['pro', 'business'] },
      status: 'active',
      stripeSubscriptionId: { not: null },
    });
  });

  it('keeps an explicit tier when it is combined with a billing filter', async () => {
    // "business tiers I gave away" — the tier must survive the billing merge, not be
    // overwritten by the filter's own tier:{in:[pro,business]}.
    const prisma = makePrisma();
    await new AdminService(prisma, cache).getUsers({ ...base, tier: 'business', billing: 'comped' });
    expect(whereOf(prisma).subscription).toEqual({
      tier: 'business',
      status: 'active',
      stripeSubscriptionId: null,
    });
  });

  it('ignores an unknown billing value instead of filtering everything out', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache).getUsers({ ...base, billing: 'nonsense' });
    expect(whereOf(prisma).subscription).toBeUndefined();
  });

  it('flags each row and never leaks the Stripe subscription id', async () => {
    const prisma = makePrisma([
      { id: 'p1', email: 'p@x', name: 'Payer', subscription: { tier: 'pro', status: 'active', aiRequestsUsed: 3, stripeSubscriptionId: 'sub_1' } },
      { id: 'c1', email: 'c@x', name: 'Comped', subscription: { tier: 'business', status: 'active', aiRequestsUsed: 0, stripeSubscriptionId: null } },
      { id: 'f1', email: 'f@x', name: 'Free', subscription: null },
    ]);
    const res = await new AdminService(prisma, cache).getUsers({ ...base });

    expect(res.data.map((u: any) => u.isComplimentary)).toEqual([false, true, false]);
    expect(res.data[0].subscription).toEqual({ tier: 'pro', status: 'active', aiRequestsUsed: 3 });
    expect(JSON.stringify(res.data)).not.toContain('sub_1');
  });
});
