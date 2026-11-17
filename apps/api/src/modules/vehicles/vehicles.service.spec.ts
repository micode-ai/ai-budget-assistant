import { VehiclesService } from './vehicles.service';

function make(logs: unknown[], rates: Record<string, number> | null = { PLN: 1, EUR: 0.25 }, costs: unknown[] = []) {
  const prisma: any = {
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', accountId: 'a1' }) },
    fuelLog: {
      findMany: jest.fn().mockResolvedValue(logs),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    vehicleCost: { findMany: jest.fn().mockResolvedValue(costs), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const fx: any = { getRates: jest.fn().mockResolvedValue({ rates }) };
  return { service: new VehiclesService(prisma, fx), prisma, fx };
}

const log = (km: number, liters: number, amount: number, currencyCode = 'PLN', day = 1) => ({
  odometerKm: km,
  liters,
  isFullTank: true,
  expense: { amount, currencyCode, date: new Date(2026, 9, day) },
});

describe('VehiclesService (ABA-796)', () => {
  it('reports cost in the display currency, converting foreign fill-ups', async () => {
    // 1000 km on 60 l; the second fill was paid in EUR (25 EUR = 100 PLN at 0.25).
    const { service } = make([log(10000, 40, 200), log(10500, 30, 150, 'PLN', 10), log(11000, 30, 25, 'EUR', 20)]);
    const stats = await service.getStats('a1', 'v1', 'PLN');
    expect(stats.currencyCode).toBe('PLN');
    expect(stats.fxApproximate).toBe(false);
    expect(stats.consumptionLPer100Km).toBe(6);
    expect(stats.costPer100Km).toBe(25); // (150 + 100) over 1000 km
  });

  it('does not fetch rates when every fill-up is already in the display currency', async () => {
    const { service, fx } = make([log(10000, 40, 200), log(10500, 30, 150)]);
    await service.getStats('a1', 'v1', 'PLN');
    expect(fx.getRates).not.toHaveBeenCalled();
  });

  it('flags a fill-up with no known rate instead of summing it unconverted', async () => {
    const { service } = make([log(10000, 40, 200), log(10500, 30, 25, 'EUR')], null);
    const stats = await service.getStats('a1', 'v1', 'PLN');
    expect(stats.fxApproximate).toBe(true);
  });

  it('answers "no fill-up" for an expense without one, by PK or clientId', async () => {
    const { service, prisma } = make([]);
    expect(await service.findFuelLogForExpense('a1', 'local-1')).toEqual({ fuelLog: null, cost: null });
    const where = prisma.fuelLog.findFirst.mock.calls[0][0].where;
    expect(where.expense.OR).toEqual([{ id: 'local-1' }, { clientId: 'local-1' }]);
    expect(where.vehicle).toEqual({ isDeleted: false });
  });
});

describe('VehiclesService.move (ABA-801)', () => {
  function setup(role: string | null, fillUps: number) {
    const prisma: any = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', accountId: 'a1' }), update: jest.fn() },
      accountMember: { findUnique: jest.fn().mockResolvedValue(role ? { role } : null) },
      fuelLog: { count: jest.fn().mockResolvedValue(fillUps), deleteMany: jest.fn() },
      vehicleCost: { count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn() },
    };
    prisma.vehicle.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'v1', ...data }));
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    return { service: new VehiclesService(prisma, {} as any), prisma };
  }

  it('moves a vehicle without fill-ups to an account the caller can edit', async () => {
    const { service, prisma } = setup('owner', 0);
    await expect(service.move('a1', 'u1', 'v1', { targetAccountId: 'a2' })).resolves.toMatchObject({ accountId: 'a2' });
    expect(prisma.fuelLog.deleteMany).toHaveBeenCalledWith({ where: { vehicleId: 'v1' } });
    expect(prisma.vehicle.update.mock.calls[0][0].data).toEqual({ accountId: 'a2', categoryRules: [] });
  });

  it('refuses a vehicle with fill-ups and a target the caller cannot edit', async () => {
    await expect(setup('owner', 3).service.move('a1', 'u1', 'v1', { targetAccountId: 'a2' })).rejects.toMatchObject({
      response: { code: 'VEHICLE_IN_USE' },
    });
    await expect(setup('viewer', 0).service.move('a1', 'u1', 'v1', { targetAccountId: 'a2' })).rejects.toThrow(
      'You cannot edit the target account',
    );
  });
});

describe('VehiclesService ownership (ABA-803)', () => {
  it('adds every cost of the last 12 months by kind, with the cost per km over the distance driven', async () => {
    const recent = (m: number, d: number) => {
      const x = new Date();
      x.setMonth(x.getMonth() - m, d);
      return x;
    };
    const logs = [
      { odometerKm: 10000, liters: 40, isFullTank: true, expense: { amount: 200, currencyCode: 'PLN', date: recent(6, 1) } },
      { odometerKm: 11000, liters: 60, isFullTank: true, expense: { amount: 300, currencyCode: 'PLN', date: recent(1, 1) } },
    ];
    const costs = [
      { kind: 'insurance', expense: { amount: 1200, currencyCode: 'PLN' } },
      { kind: 'service', expense: { amount: 100, currencyCode: 'EUR' } }, // 400 PLN at 0.25
    ];
    const { service } = make(logs, { PLN: 1, EUR: 0.25 }, costs);
    const stats: any = await service.getStats('a1', 'v1', 'PLN');
    expect(stats.ownership.byKind).toMatchObject({ fuel: 500, insurance: 1200, service: 400, parking: 0 });
    expect(stats.ownership.total).toBe(2100);
    expect(stats.ownership.perMonth).toBe(175);
    expect(stats.ownership.kmLast12Months).toBe(1000);
    expect(stats.ownership.costPerKm).toBe(2.1);
  });
});

describe('VehiclesService.setCostsBulk (ABA-805)', () => {
  it('marks every found expense as a person-made cost, skipping fill-ups and counting unknown ids', async () => {
    const prisma: any = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', accountId: 'a1' }) },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', fuelLog: null },
          { id: 'e2', fuelLog: { id: 'f2' } },
          { id: 'e3', fuelLog: null },
        ]),
      },
      vehicleCost: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new VehiclesService(prisma, {} as any);
    const res = await service.setCostsBulk('a1', 'v1', { expenseIds: ['e1', 'local-2', 'e3', 'gone', 'e1'], kind: 'fuel' });
    expect(res).toEqual({ assigned: 2, skipped: 1, notFound: 1 });
    expect(prisma.expense.findMany.mock.calls[0][0].where).toMatchObject({ accountId: 'a1', isDeleted: false });
    expect(prisma.vehicleCost.upsert.mock.calls[0][0]).toMatchObject({
      where: { expenseId: 'e1' },
      create: { accountId: 'a1', vehicleId: 'v1', expenseId: 'e1', kind: 'fuel', source: null },
      update: { vehicleId: 'v1', kind: 'fuel', source: null },
    });
  });
});

describe('VehiclesService.getHistory (ABA-811)', () => {
  it('converts into the display currency and flags an unknown rate', async () => {
    const day = new Date();
    const e = (id: string, amount: number, currencyCode: string) => ({
      id,
      clientId: null,
      amount,
      currencyCode,
      date: day,
      merchant: null,
      description: null,
    });
    const logs = [{ liters: 30, odometerKm: 1000, isFullTank: true, expense: e('f1', 25, 'EUR') }];
    const costs = [
      { kind: 'service', expense: e('c1', 100, 'PLN') },
      { kind: 'tax', expense: e('c2', 7, 'XYZ') },
    ];
    const { service, prisma } = make(logs, { PLN: 1, EUR: 0.25 }, costs);
    const h = await service.getHistory('a1', 'v1', 12, 'PLN');
    expect(h.currencyCode).toBe('PLN');
    expect(h.byKind).toMatchObject({ fuel: 100, service: 100, tax: 0 });
    expect(h.fxApproximate).toBe(true);
    expect(h.items).toHaveLength(3);
    // Scoped to the account, deleted expenses excluded, `none` costs excluded.
    expect(prisma.vehicleCost.findMany.mock.calls[0][0].where).toMatchObject({
      accountId: 'a1',
      vehicleId: 'v1',
      kind: { not: 'none' },
      expense: { accountId: 'a1', isDeleted: false },
    });
  });
});
