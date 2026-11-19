import { applyPetCategoryRules, parsePetCategoryRules } from './pet-cost-rules.util';

/* eslint-disable @typescript-eslint/no-explicit-any */

function make(o: { pets?: unknown[]; ruleRows?: unknown[]; expenses?: unknown[] }) {
  return {
    pet: { findMany: jest.fn().mockResolvedValue(o.pets ?? []) },
    petCost: {
      findMany: jest.fn().mockResolvedValue(o.ruleRows ?? []),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    expense: { findMany: jest.fn().mockResolvedValue(o.expenses ?? []) },
  } as any;
}

describe('pet cost rules (ABA-833)', () => {
  it('reads only well-formed rules; the none tombstone is never a rule kind', () => {
    expect(
      parsePetCategoryRules([
        { categoryId: 'c', kind: 'vet' },
        { categoryId: 'x', kind: 'none' },
        { categoryId: 'y', kind: 'fuel' },
        'junk',
      ]),
    ).toEqual([{ categoryId: 'c', kind: 'vet' }]);
    expect(parsePetCategoryRules(null)).toEqual([]);
  });

  it('attributes expenses in a claimed category with its kind, skipping decisions by a person', async () => {
    const db = make({
      pets: [{ id: 'yoka', categoryRules: [{ categoryId: 'petfood', kind: 'food' }] }],
      expenses: [
        { id: 'e1', categoryId: 'petfood', petCost: null },
        { id: 'e2', categoryId: 'petfood', petCost: { petId: 'yoka', kind: 'food' } },
      ],
    });
    const res = await applyPetCategoryRules(db, 'acc');
    expect(res).toEqual({ attributed: 1, released: 0 });
    expect(db.petCost.upsert.mock.calls[0][0].create).toEqual({
      accountId: 'acc',
      petId: 'yoka',
      expenseId: 'e1',
      kind: 'food',
      source: 'category',
    });
    const where = db.expense.findMany.mock.calls[0][0].where;
    expect(where.accountId).toBe('acc');
    expect(where.isSplitReceivable).toBe(false);
    // A person's row (source null, the `none` tombstone included) is never matched, so never overwritten.
    expect(where.OR).toEqual([{ petCost: { is: null } }, { petCost: { is: { source: 'category' } } }]);
  });

  it('releases only rule rows whose expense left the category, was deleted or whose kind changed', async () => {
    const db = make({
      pets: [{ id: 'yoka', categoryRules: [{ categoryId: 'vet', kind: 'vet' }] }],
      ruleRows: [
        { id: 'r-ok', petId: 'yoka', kind: 'vet', expense: { categoryId: 'vet', isDeleted: false, isPlanned: false } },
        { id: 'r-moved', petId: 'yoka', kind: 'vet', expense: { categoryId: 'food', isDeleted: false, isPlanned: false } },
        { id: 'r-kind', petId: 'yoka', kind: 'other', expense: { categoryId: 'vet', isDeleted: false, isPlanned: false } },
        { id: 'r-del', petId: 'yoka', kind: 'vet', expense: { categoryId: 'vet', isDeleted: true, isPlanned: false } },
      ],
    });
    const res = await applyPetCategoryRules(db, 'acc');
    expect(res.released).toBe(3);
    expect(db.petCost.findMany.mock.calls[0][0].where).toEqual({ accountId: 'acc', source: 'category' });
    expect(db.petCost.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r-moved', 'r-kind', 'r-del'] } } });
  });

  it('gives a category claimed by two pets to the oldest', async () => {
    const db = make({
      pets: [
        { id: 'old', categoryRules: [{ categoryId: 'groom', kind: 'grooming' }] },
        { id: 'new', categoryRules: [{ categoryId: 'groom', kind: 'grooming' }] },
      ],
      expenses: [{ id: 'e1', categoryId: 'groom', petCost: null }],
    });
    await applyPetCategoryRules(db, 'acc');
    expect(db.petCost.upsert.mock.calls[0][0].create.petId).toBe('old');
  });

  it('does not query expenses when no pet has a rule', async () => {
    const db = make({ pets: [{ id: 'yoka', categoryRules: [] }] });
    expect(await applyPetCategoryRules(db, 'acc')).toEqual({ attributed: 0, released: 0 });
    expect(db.expense.findMany).not.toHaveBeenCalled();
  });
});
