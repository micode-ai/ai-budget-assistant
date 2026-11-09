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
const ownership = { handleOwnerDeparture: jest.fn(), handleHardDelete: jest.fn() } as any;
const base = { page: 1, limit: 20 };

function whereOf(prisma: any) {
  return prisma.user.findMany.mock.calls[0][0].where;
}

describe('AdminService.getUsers — comped flagging and billing filter', () => {
  it('builds no subscription filter when neither tier nor billing is given', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base });
    expect(whereOf(prisma).subscription).toBeUndefined();
  });

  it('filters to admin-granted subscriptions on billing=comped', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base, billing: 'comped' });
    expect(whereOf(prisma).subscription).toEqual({
      tier: { in: ['pro', 'business'] },
      status: 'active',
      stripeSubscriptionId: null,
    });
  });

  it('filters to Stripe-backed subscriptions on billing=paying', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base, billing: 'paying' });
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
    await new AdminService(prisma, cache, ownership).getUsers({ ...base, tier: 'business', billing: 'comped' });
    expect(whereOf(prisma).subscription).toEqual({
      tier: 'business',
      status: 'active',
      stripeSubscriptionId: null,
    });
  });

  it('ignores an unknown billing value instead of filtering everything out', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base, billing: 'nonsense' });
    expect(whereOf(prisma).subscription).toBeUndefined();
  });

  it('flags each row and never leaks the Stripe subscription id', async () => {
    const prisma = makePrisma([
      { id: 'p1', email: 'p@x', name: 'Payer', subscription: { tier: 'pro', status: 'active', aiRequestsUsed: 3, stripeSubscriptionId: 'sub_1' } },
      { id: 'c1', email: 'c@x', name: 'Comped', subscription: { tier: 'business', status: 'active', aiRequestsUsed: 0, stripeSubscriptionId: null } },
      { id: 'f1', email: 'f@x', name: 'Free', subscription: null },
    ]);
    const res = await new AdminService(prisma, cache, ownership).getUsers({ ...base });

    expect(res.data.map((u: any) => u.isComplimentary)).toEqual([false, true, false]);
    expect(res.data[0].subscription).toEqual({ tier: 'pro', status: 'active', aiRequestsUsed: 3 });
    expect(JSON.stringify(res.data)).not.toContain('sub_1');
  });
});

describe('AdminService.getUsers — default order and expense count', () => {
  const orderOf = (prisma: any) => prisma.user.findMany.mock.calls[0][0].orderBy;

  it('defaults to most recently active first, never-active users last', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base });
    expect(orderOf(prisma)).toEqual([{ lastSyncAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]);
  });

  it('keeps never-active users last when sorting Last Active ascending too', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base, sortBy: 'lastSyncAt', order: 'asc' });
    expect(orderOf(prisma)[0]).toEqual({ lastSyncAt: { sort: 'asc', nulls: 'last' } });
  });

  it('falls back on an unknown sort field and an unknown order', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({
      ...base,
      sortBy: 'passwordHash',
      order: 'sideways' as any,
    });
    expect(orderOf(prisma)[0]).toEqual({ lastSyncAt: { sort: 'desc', nulls: 'last' } });
  });

  it('sorts other fields plainly', async () => {
    const prisma = makePrisma();
    await new AdminService(prisma, cache, ownership).getUsers({ ...base, sortBy: 'name', order: 'asc' });
    expect(orderOf(prisma)[0]).toEqual({ name: 'asc' });
  });

  it('counts only non-deleted expenses and flattens the count onto the row', async () => {
    const prisma = makePrisma([
      { id: 'u1', email: 'a@x', name: 'A', subscription: null, _count: { expenses: 42 } },
      { id: 'u2', email: 'b@x', name: 'B', subscription: null },
    ]);
    const res = await new AdminService(prisma, cache, ownership).getUsers({ ...base });
    expect(prisma.user.findMany.mock.calls[0][0].select._count).toEqual({
      select: { expenses: { where: { isDeleted: false } } },
    });
    expect(res.data.map((u: any) => u.expenseCount)).toEqual([42, 0]);
    expect(res.data[0]).not.toHaveProperty('_count');
  });
});

describe('AdminService account removal runs inside the group-ownership transaction (ABA-650)', () => {
  const order: string[] = [];
  const tx = {
    user: {
      update: jest.fn(async () => {
        order.push('update');
        return { id: 'u1', isActive: false };
      }),
      delete: jest.fn(async () => {
        order.push('delete');
      }),
    },
  };
  // leavePlatform runs the account change on the transaction client, after the group steps.
  const own = {
    leavePlatform: jest.fn(async (_id: string, _opts: any, then: (t: any) => Promise<any>) => {
      order.push('groups');
      return then(tx);
    }),
  } as any;
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1', name: 'Ann', email: 'a@x' })) },
    adminAuditLog: { create: jest.fn(async () => ({})) },
  } as any;

  beforeEach(() => {
    order.length = 0;
    jest.clearAllMocks();
  });

  it('hard delete anonymizes, and the delete runs on the transaction client after the group steps', async () => {
    await new AdminService(prisma, cache, own).deleteUser('u1', 'admin');
    expect(own.leavePlatform).toHaveBeenCalledWith('u1', { anonymize: true }, expect.any(Function));
    expect(order).toEqual(['groups', 'delete']);
  });

  it('does not delete the user when the group step fails', async () => {
    own.leavePlatform.mockRejectedValueOnce(new Error('db down'));
    await expect(new AdminService(prisma, cache, own).deleteUser('u1', 'admin')).rejects.toThrow('db down');
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it('a suspension hands groups on but does NOT anonymize', async () => {
    await new AdminService(prisma, cache, own).deactivateUser('u1');
    expect(own.leavePlatform).toHaveBeenCalledWith('u1', { anonymize: false }, expect.any(Function));
    expect(order).toEqual(['groups', 'update']);
  });
});
