import { VehiclesService } from './vehicles.service';

function make(logs: unknown[], rates: Record<string, number> | null = { PLN: 1, EUR: 0.25 }) {
  const prisma: any = {
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', accountId: 'a1' }) },
    fuelLog: {
      findMany: jest.fn().mockResolvedValue(logs),
      findFirst: jest.fn().mockResolvedValue(null),
    },
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
    expect(await service.findFuelLogForExpense('a1', 'local-1')).toEqual({ fuelLog: null });
    const where = prisma.fuelLog.findFirst.mock.calls[0][0].where;
    expect(where.expense.OR).toEqual([{ id: 'local-1' }, { clientId: 'local-1' }]);
    expect(where.vehicle).toEqual({ isDeleted: false });
  });
});
