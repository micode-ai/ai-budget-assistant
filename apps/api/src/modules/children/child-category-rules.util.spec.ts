import { applyChildCategoryRules } from './child-category-rules.util';

/* eslint-disable @typescript-eslint/no-explicit-any */

function make(o: {
  children?: { id: string; categoryIds: string[] }[];
  ruleLinks?: unknown[];
  expenses?: unknown[];
}) {
  const db: any = {
    child: { findMany: jest.fn().mockResolvedValue(o.children ?? []) },
    expenseChild: {
      findMany: jest.fn().mockResolvedValue(o.ruleLinks ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    expense: {
      findMany: jest.fn().mockResolvedValue(o.expenses ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return db;
}

describe('applyChildCategoryRules (ABA-802)', () => {
  it('attributes expenses in a claimed category to the child, marked as the rule', async () => {
    const db = make({
      children: [{ id: 'kid', categoryIds: ['cat-m'] }],
      expenses: [
        { id: 'e1', categoryId: 'cat-m', expenseChildren: [] },
        { id: 'e2', categoryId: 'cat-m', expenseChildren: [{ childId: 'kid' }] }, // already right
      ],
    });
    const res = await applyChildCategoryRules(db, 'acc');
    expect(res).toEqual({ attributed: 1, released: 0 });
    expect(db.expenseChild.upsert).toHaveBeenCalledTimes(1);
    expect(db.expenseChild.upsert.mock.calls[0][0]).toMatchObject({
      where: { expenseId_childId: { expenseId: 'e1', childId: 'kid' } },
      create: { expenseId: 'e1', childId: 'kid', share: 1, source: 'category' },
    });
    // Touched expenses are bumped for device pulls.
    expect(db.expense.updateMany).toHaveBeenCalled();
  });

  it('never touches an expense a person decided about or with a line attributed', async () => {
    const db = make({ children: [{ id: 'kid', categoryIds: ['cat-m'] }] });
    await applyChildCategoryRules(db, 'acc');
    const where = db.expense.findMany.mock.calls[0][0].where;
    expect(where.expenseChildren).toEqual({ none: { source: null } });
    expect(where.items).toEqual({ none: { childId: { not: null }, isDeleted: false } });
    expect(where).toMatchObject({ isDeleted: false, isPlanned: false, isSplitReceivable: false, categoryId: { in: ['cat-m'] } });
  });

  it('releases rule links whose expense left the category, was deleted or whose child dropped it', async () => {
    const db = make({
      children: [{ id: 'kid', categoryIds: ['cat-m'] }],
      ruleLinks: [
        { id: 'l-ok', childId: 'kid', expenseId: 'e1', expense: { categoryId: 'cat-m', isDeleted: false, isPlanned: false } },
        { id: 'l-moved', childId: 'kid', expenseId: 'e2', expense: { categoryId: 'cat-food', isDeleted: false, isPlanned: false } },
        { id: 'l-deleted', childId: 'kid', expenseId: 'e3', expense: { categoryId: 'cat-m', isDeleted: true, isPlanned: false } },
        { id: 'l-other', childId: 'old-kid', expenseId: 'e4', expense: { categoryId: 'cat-m', isDeleted: false, isPlanned: false } },
      ],
    });
    const res = await applyChildCategoryRules(db, 'acc');
    expect(res.released).toBe(3);
    expect(db.expenseChild.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['l-moved', 'l-deleted', 'l-other'] } });
  });

  it('splits an expense equally between two children claiming one category, summing to 1', async () => {
    const db = make({
      children: [{ id: 'a', categoryIds: ['cat'] }, { id: 'b', categoryIds: ['cat'] }, { id: 'c', categoryIds: ['cat'] }],
      expenses: [{ id: 'e1', categoryId: 'cat', expenseChildren: [] }],
    });
    await applyChildCategoryRules(db, 'acc');
    const shares = db.expenseChild.upsert.mock.calls.map((c: any) => c[0].create.share);
    expect(shares).toEqual([0.3334, 0.3333, 0.3333]);
    expect(shares.reduce((s: number, x: number) => s + x, 0)).toBeCloseTo(1, 10);
  });

  it('does nothing without rules', async () => {
    const db = make({});
    expect(await applyChildCategoryRules(db, 'acc')).toEqual({ attributed: 0, released: 0 });
    expect(db.expense.findMany).not.toHaveBeenCalled();
  });
});
