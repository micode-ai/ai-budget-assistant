import type { Budget, BudgetProgress } from '@budget/shared-types';
import {
  normalizeExhaustionDate,
  resolveBudgetProjection,
} from '../budgetProjection';

/**
 * Whether a budget is heading past its limit, and which SINGLE sentence says so.
 *
 * Every test below names the one production change that would make it fail. A
 * test that cannot be broken by a named edit pins nothing, so if a case here
 * carries no such note, delete it rather than keep it for the count.
 */

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    localId: 'b1',
    userId: 'u1',
    accountId: 'a1',
    name: 'Groceries',
    amount: 500,
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-09-01T00:00:00Z'),
    alertThreshold: null,
    isActive: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 1,
    ...over,
  };
}

function progress(over: Partial<BudgetProgress> = {}): BudgetProgress {
  const b = over.budget ?? budget();
  return {
    budget: b,
    spent: 340,
    remaining: 160,
    percentageUsed: 68,
    isOverBudget: false,
    daysRemaining: 12,
    projectedTotal: 400,
    dailyBurnRate: 20,
    ...over,
  };
}

describe('resolveBudgetProjection', () => {
  it('says nothing when there is no progress to reason from', () => {
    // Breaks if: the `if (!progress) return null` guard is dropped — the next
    // line reads `progress.isOverBudget` and throws, taking the whole
    // dashboard down rather than quietly saying nothing.
    expect(resolveBudgetProjection(budget(), null)).toBeNull();
    expect(resolveBudgetProjection(budget(), undefined)).toBeNull();
  });

  it('says nothing about a budget that is on course to come in under', () => {
    // Breaks if: the comparison is inverted, or the `null` return is removed
    // and every budget in the account starts claiming a row.
    expect(resolveBudgetProjection(budget(), progress({ projectedTotal: 400 }))).toBeNull();
  });

  it('treats landing exactly on the limit as not exceeding it', () => {
    // Breaks if: `projectedTotal <= budget.amount` becomes `< budget.amount`.
    // Spending your budget precisely is the plan working, not a problem, and
    // an off-by-one here puts a permanent row on the dashboard of anyone whose
    // burn rate happens to land on the number.
    expect(resolveBudgetProjection(budget(), progress({ projectedTotal: 500 }))).toBeNull();
  });

  it('warns once, with the date, when the crossing day is known', () => {
    // Breaks if: the exhaustion date and the projected total are ever returned
    // as two separate renderable facts. THIS IS THE WHOLE POINT of the module.
    // `BudgetsMobile.tsx` renders them as two `<Text>` blocks and prints both
    // at once — "Runs out ~24 Sep" then "Projected: 620 zł" — which reads as
    // two problems when there is one. One key, one amount, one date.
    const date = new Date('2026-09-24T10:00:00Z');
    const result = resolveBudgetProjection(
      budget(),
      progress({ projectedTotal: 620, estimatedExhaustionDate: date }),
    );

    expect(result).toEqual({
      status: 'projected',
      i18nKey: 'budgetsDesktop.projectedExceedBy',
      amount: 620,
      date,
    });
  });

  it('falls back to the dateless sentence when no crossing day was computed', () => {
    // Breaks if: the `date ? ... : ...` ternary is inverted, or the fallback
    // key is dropped. `budgetStore` leaves `estimatedExhaustionDate` unset
    // whenever the crossing falls outside the period, so this is a real state,
    // and picking `projectedExceedBy` for it renders "(~{{date}})" with an
    // empty interpolation.
    const result = resolveBudgetProjection(budget(), progress({ projectedTotal: 620 }));

    expect(result).toEqual({
      status: 'projected',
      i18nKey: 'insights.projectedTotal',
      amount: 620,
      date: null,
    });
  });

  it('reports an already-exceeded budget as exceeded, not as a forecast', () => {
    // Breaks if: the `progress.isOverBudget` branch is removed on the grounds
    // that the design says "renders only when projectedTotal > amount". It
    // would then fall through to the forecast branch and tell a user who is
    // 120 zł past their limit that they are *projected* to reach it — future
    // tense about money already gone.
    const result = resolveBudgetProjection(
      budget(),
      progress({ spent: 620, isOverBudget: true, projectedTotal: 700, percentageUsed: 124 }),
    );

    expect(result).toEqual({
      status: 'exceeded',
      i18nKey: 'budgetsDesktop.exceedsBy',
      amount: 120,
      date: null,
    });
  });

  it('quotes the overage for an exceeded budget, not the amount spent', () => {
    // Breaks if: `progress.spent - budget.amount` becomes `progress.spent`, or
    // the subtraction is reversed. "Exceeds by 620 zł" on a 500 zł budget the
    // user overspent by 120 zł is a number five times too large, and it is the
    // exact figure `BudgetCard.tsx` already shows on the budgets tab — the two
    // screens must not disagree about one budget.
    const result = resolveBudgetProjection(
      budget({ amount: 500 }),
      progress({ spent: 620, isOverBudget: true }),
    );
    expect(result?.amount).toBe(120);
  });

  it('never attaches a date to an already-exceeded budget', () => {
    // Breaks if: the exceeded branch starts reading `estimatedExhaustionDate`.
    // `budgetStore` only computes that date while `!isOverBudget`, so any value
    // present here is stale — a day in the past presented as the day you will
    // cross a line you crossed last week.
    const result = resolveBudgetProjection(
      budget(),
      progress({
        spent: 620,
        isOverBudget: true,
        estimatedExhaustionDate: new Date('2026-09-10T00:00:00Z'),
      }),
    );
    expect(result?.date).toBeNull();
  });

  it('accepts the date as an ISO string, which is how it crosses the API', () => {
    // Breaks if: `normalizeExhaustionDate` is dropped and the raw value is
    // passed through. `BudgetProgress` types the field as `Date` and it is one
    // when `budgetStore` computed it locally, but the same shape arrives from
    // the server as a string — both shipped renderers wrap it in `new Date()`
    // for exactly this reason.
    const result = resolveBudgetProjection(
      budget(),
      progress({
        projectedTotal: 620,
        estimatedExhaustionDate: '2026-09-24T10:00:00Z' as unknown as Date,
      }),
    );

    expect(result?.i18nKey).toBe('budgetsDesktop.projectedExceedBy');
    expect(result?.date).toEqual(new Date('2026-09-24T10:00:00Z'));
  });

  it('drops an unparseable date rather than rendering "Invalid Date"', () => {
    // Breaks if: normalisation becomes a truthiness check
    // (`estimatedExhaustionDate ?? null`). An `Invalid Date` object is truthy,
    // so the dated key would win and `toLocaleDateString` would print the
    // literal words "Invalid Date" into the sentence.
    const result = resolveBudgetProjection(
      budget(),
      progress({
        projectedTotal: 620,
        estimatedExhaustionDate: 'not a date' as unknown as Date,
      }),
    );

    expect(result).toEqual({
      status: 'projected',
      i18nKey: 'insights.projectedTotal',
      amount: 620,
      date: null,
    });
  });
});

describe('normalizeExhaustionDate', () => {
  it('passes a real Date through unchanged', () => {
    // Breaks if: the function re-wraps or reformats the value instead of
    // returning it, which would silently drop sub-day precision.
    const d = new Date('2026-09-24T10:00:00Z');
    expect(normalizeExhaustionDate(d)).toEqual(d);
  });

  it('parses a string', () => {
    // Breaks if: the `value instanceof Date` branch is the only branch and a
    // string returns null — every server-loaded budget would lose its date.
    expect(normalizeExhaustionDate('2026-09-24T10:00:00Z')).toEqual(
      new Date('2026-09-24T10:00:00Z'),
    );
  });

  it('answers null for nothing at all', () => {
    // Breaks if: the nullish guard is dropped — `new Date(null)` is the epoch,
    // a valid Date, so "no date" would render as 1 Jan 1970.
    expect(normalizeExhaustionDate(null)).toBeNull();
    expect(normalizeExhaustionDate(undefined)).toBeNull();
  });

  it('answers null for something that does not parse', () => {
    // Breaks if: the `Number.isNaN(date.getTime())` check is dropped.
    expect(normalizeExhaustionDate('later')).toBeNull();
    expect(normalizeExhaustionDate(new Date('nope'))).toBeNull();
  });
});
