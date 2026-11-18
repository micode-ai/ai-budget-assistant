import { PetsService } from './pets.service';

function make(rows: unknown[] = [], expenses: { id: string }[] = []) {
  const prisma: any = {
    pet: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', accountId: 'a1' }) },
    expense: { findMany: jest.fn().mockResolvedValue(expenses), findFirst: jest.fn() },
    petCost: { findMany: jest.fn().mockResolvedValue(rows), upsert: jest.fn().mockResolvedValue({}) },
  };
  const fx: any = { getRates: jest.fn().mockResolvedValue({ rates: { PLN: 1, EUR: 0.25 } }) };
  return { service: new PetsService(prisma, fx), prisma };
}

describe('PetsService', () => {
  it('bulk assign resolves PK or clientId, writes the resolved PK, and counts unknown ids', async () => {
    const { service, prisma } = make([], [{ id: 'e1' }]);
    const r = await service.setCostsBulk('a1', 'p1', { expenseIds: ['local-1', 'ghost', 'local-1'], kind: 'vet' });
    expect(r).toEqual({ assigned: 1, notFound: 1 });
    expect(prisma.expense.findMany.mock.calls[0][0].where.accountId).toBe('a1');
    expect(prisma.petCost.upsert.mock.calls[0][0].create).toMatchObject({ expenseId: 'e1', petId: 'p1', kind: 'vet' });
  });

  it('history converts to the display currency and totals the current year', async () => {
    const row = (amount: number, cur: string, date: string, kind: string) => ({
      kind,
      expense: { id: date + kind, clientId: null, amount, currencyCode: cur, date: new Date(date), merchant: null, description: null },
    });
    const { service } = make([row(100, 'PLN', '2026-11-01', 'food'), row(25, 'EUR', '2026-03-01', 'vet'), row(50, 'PLN', '2025-12-01', 'vet')]);
    const h = await service.getHistory('a1', 'p1', 0, 'PLN', new Date('2026-11-18T00:00:00Z'));
    expect(h.yearTotal).toBe(200); // 100 + 25 EUR (=100 PLN); 2025 excluded
    expect(h.total).toBe(250);
    expect(h.fxApproximate).toBe(false);
  });
});
