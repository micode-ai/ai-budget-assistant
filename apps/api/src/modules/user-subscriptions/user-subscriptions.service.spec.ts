import { NotFoundException } from '@nestjs/common';
import { UserSubscriptionsService } from './user-subscriptions.service';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    accountId: 'acc-1',
    name: 'Netflix',
    amount: 15.99,
    currencyCode: 'USD',
    billingCycle: 'monthly',
    nextRenewalDate: new Date('2026-07-01'),
    categoryId: null,
    notes: null,
    detectedFrom: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeService(overrides: {
  findMany?: jest.Mock;
  findFirst?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
} = {}) {
  const prisma: any = {
    userSubscription: {
      findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
      findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
      create: overrides.create ?? jest.fn().mockResolvedValue(makeSub()),
      update: overrides.update ?? jest.fn().mockResolvedValue(makeSub()),
      delete: overrides.delete ?? jest.fn().mockResolvedValue(makeSub()),
    },
  };
  const service = new UserSubscriptionsService(prisma);
  return { service, prisma };
}

describe('computeMonthlyEquivalent (via returned monthlyEquivalent)', () => {
  it('monthly: returns amount unchanged', async () => {
    const { service } = makeService({
      findMany: jest.fn().mockResolvedValue([makeSub({ amount: 12, billingCycle: 'monthly' })]),
    });
    const [s] = await service.findAll('acc-1');
    expect(s.monthlyEquivalent).toBe(12);
  });

  it('yearly: divides by 12', async () => {
    const { service } = makeService({
      findMany: jest.fn().mockResolvedValue([makeSub({ amount: 120, billingCycle: 'yearly' })]),
    });
    const [s] = await service.findAll('acc-1');
    expect(s.monthlyEquivalent).toBe(10);
  });

  it('quarterly: divides by 3', async () => {
    const { service } = makeService({
      findMany: jest.fn().mockResolvedValue([makeSub({ amount: 30, billingCycle: 'quarterly' })]),
    });
    const [s] = await service.findAll('acc-1');
    expect(s.monthlyEquivalent).toBe(10);
  });

  it('weekly: multiplies by 52/12 and rounds to 2dp', async () => {
    const { service } = makeService({
      findMany: jest.fn().mockResolvedValue([makeSub({ amount: 10, billingCycle: 'weekly' })]),
    });
    const [s] = await service.findAll('acc-1');
    // 10 * (52/12) = 43.333... → rounded to 43.33
    expect(s.monthlyEquivalent).toBe(43.33);
  });
});

describe('create', () => {
  it('creates and returns mapped subscription', async () => {
    const created = makeSub({ name: 'Spotify', amount: 9.99 });
    const { service, prisma } = makeService({ create: jest.fn().mockResolvedValue(created) });

    const result = await service.create('acc-1', {
      name: 'Spotify',
      amount: 9.99,
      currencyCode: 'USD',
      billingCycle: 'monthly',
      nextRenewalDate: '2026-07-01',
    } as any);

    expect(prisma.userSubscription.create).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Spotify');
    expect(result.amount).toBe(9.99);
    expect(result.monthlyEquivalent).toBe(9.99);
  });
});

describe('update', () => {
  it('throws NotFoundException when subscription not found', async () => {
    const { service } = makeService({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(service.update('acc-1', 'sub-missing', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('applies partial update with only provided fields', async () => {
    const existing = makeSub();
    const updated = makeSub({ name: 'Updated' });
    const { service, prisma } = makeService({
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue(updated),
    });

    await service.update('acc-1', 'sub-1', { name: 'Updated' });

    const call = prisma.userSubscription.update.mock.calls[0][0];
    expect(call.data.name).toBe('Updated');
    expect(call.data).not.toHaveProperty('amount');
  });

  it('explicitly sets categoryId to null when dto contains categoryId: null', async () => {
    const existing = makeSub({ categoryId: 'cat-1' });
    const updated = makeSub({ categoryId: null });
    const { service, prisma } = makeService({
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue(updated),
    });

    await service.update('acc-1', 'sub-1', { categoryId: null } as any);

    const call = prisma.userSubscription.update.mock.calls[0][0];
    expect(call.data).toHaveProperty('categoryId');
    expect(call.data.categoryId).toBeNull();
  });
});

describe('remove', () => {
  it('throws NotFoundException when subscription not found', async () => {
    const { service } = makeService({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(service.remove('acc-1', 'sub-missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes and returns success', async () => {
    const existing = makeSub();
    const { service, prisma } = makeService({
      findFirst: jest.fn().mockResolvedValue(existing),
      delete: jest.fn().mockResolvedValue(existing),
    });

    const result = await service.remove('acc-1', 'sub-1');
    expect(prisma.userSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    expect(result).toEqual({ success: true });
  });
});
