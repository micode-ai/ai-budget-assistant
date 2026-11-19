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

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('PetsService', () => {
  it('bulk assign resolves PK or clientId, writes the resolved PK, and counts unknown ids', async () => {
    const { service, prisma } = make([], [{ id: 'e1' }]);
    const r = await service.setCostsBulk('a1', 'p1', { expenseIds: ['local-1', 'ghost', 'local-1'], kind: 'vet' });
    expect(r).toEqual({ assigned: 1, notFound: 1 });
    expect(prisma.expense.findMany.mock.calls[0][0].where.accountId).toBe('a1');
    expect(prisma.petCost.upsert.mock.calls[0][0].create).toMatchObject({ expenseId: 'e1', petId: 'p1', kind: 'vet' });
  });

  it('create stores the reminder dates as calendar days in the caller account', async () => {
    const { service, prisma } = make();
    prisma.pet.create = jest.fn().mockResolvedValue({});
    await service.create('a1', 'u1', { name: ' Yoka ', species: 'dog', nextVaccinationDate: '2026-12-01', nextParasiteTreatmentDate: '2026-11-30' });
    const data = prisma.pet.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ accountId: 'a1', userId: 'u1', name: 'Yoka', species: 'dog' });
    expect(data.nextVaccinationDate.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(data.nextParasiteTreatmentDate.toISOString()).toBe('2026-11-30T00:00:00.000Z');
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

  it('a manual cost (single and bulk) is written with source null so a rule never overwrites it', async () => {
    const { service, prisma } = make([], [{ id: 'e1' }]);
    prisma.expense.findFirst.mockResolvedValue({ id: 'e9', categoryId: 'c1' });
    await service.setCost('a1', 'p1', 'local-9', { kind: 'vet' });
    expect(prisma.petCost.upsert.mock.calls[0][0]).toMatchObject({
      where: { expenseId: 'e9' },
      create: { expenseId: 'e9', kind: 'vet', source: null },
      update: { kind: 'vet', source: null },
    });
    await service.setCostsBulk('a1', 'p1', { expenseIds: ['e1'], kind: 'food' });
    expect(prisma.petCost.upsert.mock.calls[1][0].update.source).toBeNull();
  });

  it('removing a cost the rule would re-add leaves a none tombstone; otherwise deletes the row', async () => {
    const { service, prisma } = make();
    prisma.expense.findFirst.mockResolvedValue({ id: 'e1', categoryId: 'petfood' });
    prisma.petCost.findFirst = jest.fn().mockResolvedValue({ id: 'pc1', kind: 'food' });
    prisma.petCost.update = jest.fn().mockResolvedValue({});
    prisma.petCost.delete = jest.fn().mockResolvedValue({});
    prisma.pet.findMany = jest.fn().mockResolvedValue([{ categoryRules: [{ categoryId: 'petfood', kind: 'food' }] }]);
    await service.removeCost('a1', 'e1');
    expect(prisma.petCost.update).toHaveBeenCalledWith({ where: { id: 'pc1' }, data: { kind: 'none', source: null } });
    expect(prisma.petCost.delete).not.toHaveBeenCalled();

    prisma.pet.findMany.mockResolvedValue([{ categoryRules: [{ categoryId: 'vet', kind: 'vet' }] }]);
    await service.removeCost('a1', 'e1');
    expect(prisma.petCost.delete).toHaveBeenCalledWith({ where: { id: 'pc1' } });
  });

  it('a tombstone is not a cost: removing it again is a 404, and history and lists skip it', async () => {
    const { service, prisma } = make();
    prisma.expense.findFirst.mockResolvedValue({ id: 'e1', categoryId: 'petfood' });
    prisma.petCost.findFirst = jest.fn().mockResolvedValue({ id: 'pc1', kind: 'none' });
    await expect(service.removeCost('a1', 'e1')).rejects.toThrow('Pet cost not found');
    await service.getHistory('a1', 'p1', 12, 'PLN');
    await service.listCosts('a1', 'p1');
    for (const call of prisma.petCost.findMany.mock.calls) expect(call[0].where.kind).toEqual({ not: 'none' });
  });

  it('update resolves rule categories (PK or clientId) to the PK, expense type only, and applies them', async () => {
    const { service, prisma } = make();
    prisma.category = { findFirst: jest.fn().mockResolvedValue({ id: 'cat-pk' }) };
    prisma.pet.update = jest.fn().mockResolvedValue({ id: 'p1' });
    prisma.pet.findMany = jest.fn().mockResolvedValue([]);
    prisma.petCost.deleteMany = jest.fn();
    const res: any = await service.update('a1', 'p1', { categoryRules: [{ categoryId: 'local-cat', kind: 'food' }] });
    const where = prisma.category.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ OR: [{ id: 'local-cat' }, { clientId: 'local-cat' }], isDeleted: false, type: 'expense' });
    expect(where.AND).toEqual([{ OR: [{ accountId: 'a1' }, { accountId: null }] }]);
    expect(prisma.pet.update.mock.calls[0][0].data.categoryRules).toEqual([{ categoryId: 'cat-pk', kind: 'food' }]);
    expect(res.rulesApplied).toEqual({ attributed: 0, released: 0 });
  });

  it('rejects a rule on a category the account cannot see', async () => {
    const { service, prisma } = make();
    prisma.category = { findFirst: jest.fn().mockResolvedValue(null) };
    prisma.pet.update = jest.fn();
    await expect(service.update('a1', 'p1', { categoryRules: [{ categoryId: 'foreign', kind: 'vet' }] })).rejects.toThrow(
      'Unknown expense category',
    );
    expect(prisma.pet.update).not.toHaveBeenCalled();
  });

  it('the expense screen lookup never returns a tombstone and resolves PK or clientId', async () => {
    const { service, prisma } = make();
    prisma.petCost.findFirst = jest.fn().mockResolvedValue(null);
    expect(await service.findCostForExpense('a1', 'local-1')).toEqual({ cost: null });
    const where = prisma.petCost.findFirst.mock.calls[0][0].where;
    expect(where.kind).toEqual({ not: 'none' });
    expect(where.expense.OR).toEqual([{ id: 'local-1' }, { clientId: 'local-1' }]);
  });
});
