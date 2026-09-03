import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExchangeRateAlertsService, MAX_ACTIVE_WATCHES } from './exchange-rate-alerts.service';

function makeWatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'watch-1',
    userId: 'user-1',
    fromCurrency: 'USD',
    toCurrency: 'PLN',
    targetRate: 4.35,
    direction: 'above',
    isActive: true,
    createdAt: new Date('2026-09-01'),
    triggeredAt: null,
    triggeredRate: null,
    ...overrides,
  };
}

function makeService(overrides: {
  count?: jest.Mock;
  create?: jest.Mock;
  findMany?: jest.Mock;
  deleteMany?: jest.Mock;
} = {}) {
  const prisma: any = {
    exchangeRateWatch: {
      count: overrides.count ?? jest.fn().mockResolvedValue(0),
      create: overrides.create ?? jest.fn().mockResolvedValue(makeWatch()),
      findMany: overrides.findMany ?? jest.fn().mockResolvedValue([makeWatch()]),
      deleteMany: overrides.deleteMany ?? jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new ExchangeRateAlertsService(prisma);
  return { service, prisma };
}

describe('ExchangeRateAlertsService.create', () => {
  it('creates a watch for supported, differing currencies', async () => {
    const { service, prisma } = makeService();
    const result = await service.create('user-1', {
      fromCurrency: 'USD',
      toCurrency: 'PLN',
      targetRate: 4.35,
      direction: 'above',
    });
    expect(result).toEqual(makeWatch());
    expect(prisma.exchangeRateWatch.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', fromCurrency: 'USD', toCurrency: 'PLN', targetRate: 4.35, direction: 'above' },
    });
  });

  it('rejects an unsupported currency', async () => {
    const { service } = makeService();
    await expect(
      service.create('user-1', { fromCurrency: 'USD', toCurrency: 'XYZ', targetRate: 1, direction: 'above' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fromCurrency === toCurrency', async () => {
    const { service } = makeService();
    await expect(
      service.create('user-1', { fromCurrency: 'USD', toCurrency: 'USD', targetRate: 1, direction: 'above' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects once the user has MAX_ACTIVE_WATCHES active watches', async () => {
    const { service } = makeService({ count: jest.fn().mockResolvedValue(MAX_ACTIVE_WATCHES) });
    await expect(
      service.create('user-1', { fromCurrency: 'USD', toCurrency: 'PLN', targetRate: 4.35, direction: 'above' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ExchangeRateAlertsService.findAllForUser', () => {
  it('scopes the query to the caller', async () => {
    const { service, prisma } = makeService();
    await service.findAllForUser('user-1');
    expect(prisma.exchangeRateWatch.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('ExchangeRateAlertsService.remove', () => {
  it('deletes when the row belongs to the caller', async () => {
    const { service, prisma } = makeService({ deleteMany: jest.fn().mockResolvedValue({ count: 1 }) });
    await expect(service.remove('user-1', 'watch-1')).resolves.toBeUndefined();
    expect(prisma.exchangeRateWatch.deleteMany).toHaveBeenCalledWith({ where: { id: 'watch-1', userId: 'user-1' } });
  });

  it('404s instead of leaking existence when the row belongs to someone else', async () => {
    const { service } = makeService({ deleteMany: jest.fn().mockResolvedValue({ count: 0 }) });
    await expect(service.remove('user-2', 'watch-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
