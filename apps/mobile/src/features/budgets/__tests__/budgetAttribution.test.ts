import { attributeBudgetSpend } from '../budgetAttribution';

const GROCERIES = 'cat-groceries';
const HOUSEHOLD = 'cat-household';
const DEPOSIT = 'cat-deposit';

/**
 * The mobile Expense entity names the relation `splits`, not `categorySplits`
 * (packages/shared-types/src/entities/expense.ts). A silent mismatch there
 * would make every phone budget read as unsplit, so it is pinned here.
 */
const splitReceipt = {
  id: 'e1',
  date: '2026-09-08T00:00:00.000Z',
  amount: 240,
  categoryId: GROCERIES,
  splits: [
    { categoryId: GROCERIES, amount: 180, isDeleted: false },
    { categoryId: HOUSEHOLD, amount: 35, isDeleted: false },
    { categoryId: DEPOSIT, amount: 25, isDeleted: false },
  ],
};

const plain = { id: 'e2', date: '2026-09-09T00:00:00.000Z', amount: 90, categoryId: GROCERIES };

describe('attributeBudgetSpend', () => {
  it('gives a split-only category its share — the reported bug', () => {
    expect(attributeBudgetSpend([splitReceipt], new Set([HOUSEHOLD])).spent).toBe(35);
  });

  it('stops the own category absorbing the whole receipt', () => {
    expect(attributeBudgetSpend([splitReceipt], new Set([GROCERIES])).spent).toBe(180);
  });

  it('breaks the total down per category, and the parts sum to the whole', () => {
    const result = attributeBudgetSpend([splitReceipt], new Set([GROCERIES, HOUSEHOLD]));
    expect(result.byCategory.get(GROCERIES)).toBe(180);
    expect(result.byCategory.get(HOUSEHOLD)).toBe(35);
    expect(result.spent).toBe(215);
    expect([...result.byCategory.values()].reduce((a, b) => a + b, 0)).toBe(result.spent);
  });

  it('gives an unsplit expense its whole amount', () => {
    expect(attributeBudgetSpend([plain], new Set([GROCERIES])).spent).toBe(90);
  });

  it('gives an unsplit expense in another category nothing', () => {
    expect(attributeBudgetSpend([plain], new Set([HOUSEHOLD])).spent).toBe(0);
  });

  it('ignores a soft-deleted split, which the local table keeps as a tombstone', () => {
    const withTombstone = {
      ...splitReceipt,
      splits: [
        { categoryId: GROCERIES, amount: 240, isDeleted: false },
        { categoryId: HOUSEHOLD, amount: 35, isDeleted: true },
      ],
    };
    expect(attributeBudgetSpend([withTombstone], new Set([HOUSEHOLD])).spent).toBe(0);
  });

  it('counts every expense whole for an overall budget (null set)', () => {
    const result = attributeBudgetSpend([splitReceipt, plain], null);
    expect(result.spent).toBe(330);
    expect(result.byCategory.size).toBe(0);
  });

  it('totals one entry per calendar day, from the attributed money', () => {
    // Two receipts, one day apart. The household budget sees 35 on each day,
    // not 240 — which is the money the projection used to extrapolate from.
    const second = { ...splitReceipt, id: 'e3', date: '2026-09-09T00:00:00.000Z' };
    const result = attributeBudgetSpend([splitReceipt, second], new Set([HOUSEHOLD]));
    expect([...result.byDay.values()]).toEqual([35, 35]);
  });

  it('leaves a day out entirely when nothing on it belongs to the budget', () => {
    const result = attributeBudgetSpend([splitReceipt, plain], new Set([HOUSEHOLD]));
    expect(result.byDay.size).toBe(1);
  });
});
