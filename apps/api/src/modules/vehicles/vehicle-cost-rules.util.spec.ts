import { applyVehicleCategoryRules, parseCategoryRules } from './vehicle-cost-rules.util';

/* eslint-disable @typescript-eslint/no-explicit-any */

function make(o: { vehicles?: unknown[]; ruleRows?: unknown[]; expenses?: unknown[] }) {
  return {
    vehicle: { findMany: jest.fn().mockResolvedValue(o.vehicles ?? []) },
    vehicleCost: {
      findMany: jest.fn().mockResolvedValue(o.ruleRows ?? []),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    expense: { findMany: jest.fn().mockResolvedValue(o.expenses ?? []) },
  } as any;
}

describe('vehicle cost rules (ABA-803)', () => {
  it('reads only well-formed rules', () => {
    expect(parseCategoryRules([{ categoryId: 'c', kind: 'insurance' }, { categoryId: 'x', kind: 'fuel' }, 'junk'])).toEqual([
      { categoryId: 'c', kind: 'insurance' },
    ]);
    expect(parseCategoryRules(null)).toEqual([]);
  });

  it('attributes expenses in a claimed category with its kind, skipping fill-ups and decisions by a person', async () => {
    const db = make({
      vehicles: [{ id: 'car', categoryRules: [{ categoryId: 'ins', kind: 'insurance' }] }],
      expenses: [
        { id: 'e1', categoryId: 'ins', vehicleCost: null },
        { id: 'e2', categoryId: 'ins', vehicleCost: { vehicleId: 'car', kind: 'insurance' } },
      ],
    });
    const res = await applyVehicleCategoryRules(db, 'acc');
    expect(res).toEqual({ attributed: 1, released: 0 });
    expect(db.vehicleCost.upsert.mock.calls[0][0].create).toEqual({
      accountId: 'acc', vehicleId: 'car', expenseId: 'e1', kind: 'insurance', source: 'category',
    });
    const where = db.expense.findMany.mock.calls[0][0].where;
    expect(where.fuelLog).toEqual({ is: null });
    expect(where.OR).toEqual([{ vehicleCost: { is: null } }, { vehicleCost: { is: { source: 'category' } } }]);
  });

  it('releases rule rows whose expense left the category or whose kind changed', async () => {
    const db = make({
      vehicles: [{ id: 'car', categoryRules: [{ categoryId: 'svc', kind: 'service' }] }],
      ruleRows: [
        { id: 'r-ok', vehicleId: 'car', kind: 'service', expense: { categoryId: 'svc', isDeleted: false, isPlanned: false } },
        { id: 'r-moved', vehicleId: 'car', kind: 'service', expense: { categoryId: 'food', isDeleted: false, isPlanned: false } },
        { id: 'r-kind', vehicleId: 'car', kind: 'other', expense: { categoryId: 'svc', isDeleted: false, isPlanned: false } },
      ],
    });
    const res = await applyVehicleCategoryRules(db, 'acc');
    expect(res.released).toBe(2);
    expect(db.vehicleCost.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r-moved', 'r-kind'] } } });
  });

  it('gives a category claimed by two vehicles to the oldest', async () => {
    const db = make({
      vehicles: [
        { id: 'old', categoryRules: [{ categoryId: 'park', kind: 'parking' }] },
        { id: 'new', categoryRules: [{ categoryId: 'park', kind: 'parking' }] },
      ],
      expenses: [{ id: 'e1', categoryId: 'park', vehicleCost: null }],
    });
    await applyVehicleCategoryRules(db, 'acc');
    expect(db.vehicleCost.upsert.mock.calls[0][0].create.vehicleId).toBe('old');
  });
});
