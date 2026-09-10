import {
  attributeToCategories,
  attributableAmountForCategories,
} from './category-attribution';

const GROCERIES = 'cat-groceries';
const HOUSEHOLD = 'cat-household';
const DEPOSIT = 'cat-deposit';

/** The receipt from the report: 240 split 180 / 35 / 25. */
const splitReceipt = {
  amount: 240,
  categoryId: GROCERIES,
  categorySplits: [
    { categoryId: GROCERIES, amount: 180 },
    { categoryId: HOUSEHOLD, amount: 35 },
    { categoryId: DEPOSIT, amount: 25 },
  ],
};

const plainExpense = { amount: 240, categoryId: GROCERIES };

describe('attributeToCategories', () => {
  it('prefers the scalar categoryId over the category relation', () => {
    const parts = attributeToCategories({ amount: 10, categoryId: 'scalar', category: { id: 'relation' } });
    expect(parts).toEqual([{ categoryId: 'scalar', categoryName: 'Uncategorized', amount: 10 }]);
  });

  it('still reads the relation when no scalar is present', () => {
    const parts = attributeToCategories({ amount: 10, category: { id: 'relation', name: 'Food' } });
    expect(parts).toEqual([{ categoryId: 'relation', categoryName: 'Food', amount: 10 }]);
  });

  it('ignores soft-deleted splits', () => {
    const parts = attributeToCategories({
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [
        { categoryId: GROCERIES, amount: 100 },
        { categoryId: HOUSEHOLD, amount: 40, isDeleted: true },
      ],
    });
    expect(parts).toEqual([{ categoryId: GROCERIES, categoryName: 'Uncategorized', amount: 100 }]);
  });

  it('falls back to the own category when every split is soft-deleted', () => {
    const parts = attributeToCategories({
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [{ categoryId: HOUSEHOLD, amount: 100, isDeleted: true }],
    });
    expect(parts).toEqual([{ categoryId: GROCERIES, categoryName: 'Uncategorized', amount: 100 }]);
  });

  it('accepts the mobile field name `splits` as well as `categorySplits`', () => {
    const parts = attributeToCategories({
      amount: 240,
      categoryId: GROCERIES,
      splits: [
        { categoryId: GROCERIES, amount: 180 },
        { categoryId: HOUSEHOLD, amount: 60 },
      ],
    });
    expect(parts.map((p) => p.amount)).toEqual([180, 60]);
  });
});

describe('attributableAmountForCategories', () => {
  it('gives a split-only category its share — the reported bug', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([HOUSEHOLD]))).toBe(35);
  });

  it('gives the deposit category its share and nothing else', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([DEPOSIT]))).toBe(25);
  });

  it('stops the own category absorbing the whole receipt — the mirror bug', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([GROCERIES]))).toBe(180);
  });

  it('sums to the receipt when the set covers every split', () => {
    const all = new Set([GROCERIES, HOUSEHOLD, DEPOSIT]);
    expect(attributableAmountForCategories(splitReceipt, all)).toBe(240);
  });

  it('gives an unsplit expense its whole amount when its own category matches', () => {
    expect(attributableAmountForCategories(plainExpense, new Set([GROCERIES]))).toBe(240);
  });

  it('gives zero when an unsplit expense belongs to another category', () => {
    expect(attributableAmountForCategories(plainExpense, new Set([HOUSEHOLD]))).toBe(0);
  });

  it('gives zero for an empty set rather than the whole amount', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set())).toBe(0);
  });

  it('treats a non-numeric amount as zero rather than NaN', () => {
    const broken = { amount: 'not a number', categoryId: GROCERIES };
    expect(attributableAmountForCategories(broken, new Set([GROCERIES]))).toBe(0);
  });

  it('ignores a split with no category id', () => {
    const orphan = {
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [
        { categoryId: GROCERIES, amount: 60 },
        { categoryId: null, amount: 40 },
      ],
    };
    expect(attributableAmountForCategories(orphan, new Set([GROCERIES]))).toBe(60);
  });
});

// The API and the mobile client each own a copy of this rule — the API has no
// build step and cannot runtime-import @budget/shared-utils (see
// scripts/check-no-shared-utils-runtime-import.sh, which excludes *.spec.ts,
// which is why this import is legal here and nowhere else in apps/api).
// Silent drift between the two is the known failure mode of that convention,
// and it would show up as the phone and the server disagreeing about one
// budget. A test catches it; review does not.
import {
  attributeToCategories as mirrorAttribute,
  attributableAmountForCategories as mirrorAmount,
} from '@budget/shared-utils';

describe('API copy and shared-utils mirror agree', () => {
  const cases: Array<{ name: string; expense: any; set: string[] }> = [
    { name: 'split receipt, split-only category', expense: splitReceipt, set: [HOUSEHOLD] },
    { name: 'split receipt, own category', expense: splitReceipt, set: [GROCERIES] },
    { name: 'split receipt, deposit category', expense: splitReceipt, set: [DEPOSIT] },
    { name: 'split receipt, every category', expense: splitReceipt, set: [GROCERIES, HOUSEHOLD, DEPOSIT] },
    { name: 'unsplit expense, matching category', expense: plainExpense, set: [GROCERIES] },
    { name: 'unsplit expense, other category', expense: plainExpense, set: [HOUSEHOLD] },
    { name: 'empty set', expense: splitReceipt, set: [] },
    {
      name: 'soft-deleted split',
      expense: {
        amount: 100,
        categoryId: GROCERIES,
        categorySplits: [
          { categoryId: GROCERIES, amount: 100 },
          { categoryId: HOUSEHOLD, amount: 40, isDeleted: true },
        ],
      },
      set: [HOUSEHOLD],
    },
    {
      name: 'mobile `splits` field name',
      expense: {
        amount: 240,
        categoryId: GROCERIES,
        splits: [
          { categoryId: GROCERIES, amount: 180 },
          { categoryId: HOUSEHOLD, amount: 60 },
        ],
      },
      set: [HOUSEHOLD],
    },
    { name: 'non-numeric amount', expense: { amount: 'x', categoryId: GROCERIES }, set: [GROCERIES] },
    {
      name: 'relation-only category, no scalar id',
      expense: { amount: 50, category: { id: GROCERIES, name: 'Groceries' } },
      set: [GROCERIES],
    },
    {
      name: 'split carrying a category relation rather than a scalar id',
      expense: {
        amount: 100,
        categoryId: GROCERIES,
        categorySplits: [
          { amount: 60, category: { id: GROCERIES, name: 'Groceries' } },
          { amount: 40, category: { id: HOUSEHOLD, name: 'Household' } },
        ],
      },
      set: [HOUSEHOLD],
    },
  ];

  it.each(cases)('$name', ({ expense, set }) => {
    const ids = new Set(set);
    expect(mirrorAmount(expense, ids)).toBe(attributableAmountForCategories(expense, ids));
    expect(mirrorAttribute(expense)).toEqual(attributeToCategories(expense));
  });
});
