import type { Budget, BudgetProgress } from '@budget/shared-types';
import { resolveMonthlyBudgetProjection } from '../monthlyBudgetProjection';

const budget = (over: Partial<Budget> = {}): Budget =>
  ({
    id: 'b1',
    accountId: 'acc',
    name: 'Monthly',
    amount: 500,
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-09-01'),
    isActive: true,
    isDeleted: false,
    categoryAllocations: [],
    ...over,
  }) as unknown as Budget;

const progress = (over: Partial<BudgetProgress> = {}): BudgetProgress =>
  ({
    budgetId: 'b1',
    spent: 340,
    remaining: 160,
    percentageUsed: 68,
    isOverBudget: false,
    daysRemaining: 10,
    dailyBurnRate: 20,
    projectedTotal: 400,
    ...over,
  }) as unknown as BudgetProgress;

const heading = (over: Partial<BudgetProgress> = {}) =>
  progress({ projectedTotal: 620, ...over });

describe('resolveMonthlyBudgetProjection', () => {
  it('speaks for a single active monthly budget that is heading over', () => {
    const result = resolveMonthlyBudgetProjection([budget()], () => heading());
    expect(result?.projection.status).toBe('projected');
    expect(result?.currencyCode).toBe('PLN');
  });

  it('says nothing when the budget is on track', () => {
    // Breaks if: the projection gate is dropped and the line renders always.
    // "You are heading past your limit" on a budget at 68% with ten days left
    // is a false alarm on the commonest state of the card.
    expect(resolveMonthlyBudgetProjection([budget()], () => progress())).toBeNull();
  });

  it('refuses to name one budget’s limit when the card is blending two', () => {
    // Breaks if: `length !== 1` becomes `length === 0` / a `.find()` / a
    // `.some()`. The card's own headline comes from
    // `getMonthlyBudgetSummary()`, which SUMS every active monthly budget —
    // so a sentence quoting one budget's 500 would sit directly under a bar
    // drawn against 900, naming a limit that appears nowhere else on the card.
    const two = [budget({ id: 'b1' }), budget({ id: 'b2', name: 'Second' })];
    expect(resolveMonthlyBudgetProjection(two, () => heading())).toBeNull();
  });

  it('ignores budgets the user switched off', () => {
    // Breaks if: `isActive` is dropped. An inactive budget would both supply
    // the sentence AND count towards the "exactly one" test, so switching a
    // second budget off would not restore the line — it would replace it with
    // the wrong budget's.
    expect(resolveMonthlyBudgetProjection([budget({ isActive: false })], () => heading()))
      .toBeNull();
  });

  it('ignores soft-deleted budgets', () => {
    expect(resolveMonthlyBudgetProjection([budget({ isDeleted: true })], () => heading()))
      .toBeNull();
  });

  it('ignores budgets of any other period', () => {
    // Breaks if: the `period === 'monthly'` filter is dropped. The card is
    // labelled "Monthly Budget" and its figures are monthly-only; a weekly
    // budget's projection under that heading is a different period's number.
    expect(resolveMonthlyBudgetProjection([budget({ period: 'weekly' })], () => heading()))
      .toBeNull();
  });

  it('still speaks for an OVERALL budget, which has no category allocations', () => {
    // Breaks if: `resolveMonthlyBudgetSegments`'s `hasOverall` bail-out is
    // copied across. That rule exists because an overall budget has nothing to
    // SEGMENT — it projects perfectly well, and it is the commonest shape of
    // budget in the app, so copying the bail-out would remove this line from
    // exactly the accounts it helps most.
    const result = resolveMonthlyBudgetProjection(
      [budget({ categoryAllocations: [] })],
      () => heading(),
    );
    expect(result?.projection.status).toBe('projected');
  });

  it('reports the budget’s own currency, not a default', () => {
    // Breaks if: the currency is dropped and the render site falls back to the
    // display currency. An account can hold a EUR budget while displaying PLN;
    // pairing the figure with the wrong symbol restates the amount without
    // converting it.
    const result = resolveMonthlyBudgetProjection(
      [budget({ currencyCode: 'EUR' })],
      () => heading(),
    );
    expect(result?.currencyCode).toBe('EUR');
  });

  it('says nothing when progress has not been computed yet', () => {
    expect(resolveMonthlyBudgetProjection([budget()], () => null)).toBeNull();
  });

  it('says nothing for an empty budget list', () => {
    expect(resolveMonthlyBudgetProjection([], () => heading())).toBeNull();
  });
});
