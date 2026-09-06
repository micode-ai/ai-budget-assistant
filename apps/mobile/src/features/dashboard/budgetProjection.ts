import type { Budget, BudgetProgress } from '@budget/shared-types';

/**
 * Whether a budget is heading past its limit, and — when the app knows it —
 * on what date. One question, one answer, ONE sentence.
 *
 * ## Why this module exists at all
 *
 * `BudgetProgress` carries two fields that describe the same event from two
 * directions: `projectedTotal > budget.amount` ("at this rate you end the
 * period over") and `estimatedExhaustionDate` ("and here is the day you cross
 * the line"). `budgetStore.getBudgetProgress` only ever sets the date when the
 * budget is NOT already over and the burn rate is positive and the crossing
 * falls inside the period — so the date is a REFINEMENT of the projection,
 * never an independent fact.
 *
 * `BudgetsMobile.tsx` renders them as two separate `<Text>` blocks and can
 * therefore print both at once: "Runs out ~24 Sep" immediately followed by
 * "Projected: 620 zł". Two sentences about one problem read as two problems.
 * `src/components/budgets/desktop/BudgetCard.tsx` already collapsed them into
 * one line for the desktop budgets grid; this module is that same decision,
 * extracted so the dashboard's attention row and the Monthly Budget card's
 * second line cannot drift apart from it or from each other.
 *
 * ## What it deliberately does NOT do
 *
 * It does not recompute anything. `projectedTotal`, `spent`,
 * `estimatedExhaustionDate` and `isOverBudget` all arrive already computed.
 * This is a presentation decision — WHICH single sentence, and with which
 * numbers — over values that already exist.
 *
 * It also does not care whether the budget is active, deleted, or of any
 * particular period. That is composition, and composition lives in
 * `attentionItems.ts`. Keeping it out of here means the Monthly Budget card
 * can call this on the one budget it is already showing without first
 * re-deciding whether that budget deserves to exist.
 */

/**
 * The three sentences, all of which already ship in all nine locales.
 *
 * There is deliberately no fourth: the design doc asks for a
 * `dashboard.budgetProjection` key reading "At this rate you reach {{limit}}
 * on {{date}}", which does not exist in any locale. Inventing it here would
 * be nine translations minted by an engineer; `budgetsDesktop.projectedExceedBy`
 * says the same thing in words a translator has already approved. If the
 * product owner adds the new key, exactly one constant below changes.
 */
export type BudgetProjectionKey =
  | 'budgetsDesktop.exceedsBy'
  | 'budgetsDesktop.projectedExceedBy'
  | 'insights.projectedTotal';

export interface BudgetProjection {
  /**
   * `exceeded` — the money is already spent and the limit is already behind
   * us. `projected` — still inside the limit today, but not at this rate.
   *
   * The two are ordered, not alternative: a budget that is over is also
   * projected over (`projectedTotal` is `spent` scaled up by the days left,
   * so it can only be larger), which is exactly why the caller must never
   * test both and render both.
   */
  status: 'exceeded' | 'projected';
  /** The one key to render. Never a list, never a pair. */
  i18nKey: BudgetProjectionKey;
  /**
   * The single money figure this key's `{{amount}}` placeholder expects, in
   * `budget.currencyCode`. Its MEANING follows the key, and the two shipped
   * call sites in `BudgetCard.tsx` are mirrored exactly rather than
   * "corrected", so the dashboard and the budgets tab can never quote
   * different numbers for one budget:
   *
   * - `budgetsDesktop.exceedsBy` → the overage, `spent - amount`.
   * - `budgetsDesktop.projectedExceedBy` → the projected OVERAGE,
   *   `projectedTotal - amount`. The key reads "Projected to exceed BY
   *   {{amount}}" in all nine locales. Task 6 mirrored `BudgetCard.tsx`'s
   *   shipped call site, which passed the projected TOTAL — so a 500 zl budget
   *   heading for 620 read "projected to exceed by 620 zl" when the overage is
   *   120 — and reported the defect rather than fixing it inside another
   *   task's file, precisely so the dashboard and the budgets grid could not
   *   end up quoting different numbers for one budget. Both call sites are
   *   corrected together here.
   * - `insights.projectedTotal` → the projected total, which is what that key
   *   ("Projected: {{amount}}") actually names. NOT the overage: this is the
   *   dateless fallback and its own noun is "Projected", so the two keys
   *   deliberately carry different quantities.
   */
  amount: number;
  /**
   * The day the limit is crossed, or `null` when the app has no honest answer
   * — which is the normal case for an already-exceeded budget, since
   * `budgetStore` refuses to compute a crossing date once it is in the past.
   * `null` here always pairs with a key that takes no `{{date}}`.
   */
  date: Date | null;
}

/**
 * `BudgetProgress.estimatedExhaustionDate` is typed `Date`, and it genuinely
 * is one when `budgetStore.getBudgetProgress` computed it locally — but the
 * same shape crosses the API as a JSON string, and both shipped renderers
 * (`BudgetsMobile`, `BudgetCard`) wrap it in `new Date(...)` for exactly that
 * reason. Accept either, and refuse anything that does not parse: an
 * `Invalid Date` reaching `toLocaleDateString` prints the literal text
 * "Invalid Date" into the sentence, which is worse than having no date at all.
 */
export function normalizeExhaustionDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `null` means "say nothing" — the card renders unchanged and the budget earns
 * no attention row. Anything else is exactly one sentence.
 *
 * The gate is `isOverBudget` first, then `projectedTotal > amount`, matching
 * `classifyBudget`'s `needsAttention` and `BudgetCard`'s render branch. The
 * design's own wording is "the line renders only when `projectedTotal >
 * budget.amount`", and on the arithmetic that already implies the over-budget
 * case; testing `isOverBudget` first is not a widening of the rule but an
 * insurance against the one outcome that would be indefensible — a budget the
 * user has already blown through saying nothing at all.
 */
export function resolveBudgetProjection(
  budget: Budget,
  progress: BudgetProgress | null | undefined,
): BudgetProjection | null {
  if (!progress) return null;

  if (progress.isOverBudget) {
    return {
      status: 'exceeded',
      i18nKey: 'budgetsDesktop.exceedsBy',
      amount: progress.spent - budget.amount,
      date: null,
    };
  }

  if (progress.projectedTotal <= budget.amount) return null;

  const date = normalizeExhaustionDate(progress.estimatedExhaustionDate);
  // The amount follows the KEY, not the status — the two branches genuinely
  // want different quantities. `projectedExceedBy` says "exceed by", so it
  // takes the overage; `insights.projectedTotal` says "Projected:", so it
  // takes the total. See the `amount` field's doc comment above.
  return {
    status: 'projected',
    i18nKey: date ? 'budgetsDesktop.projectedExceedBy' : 'insights.projectedTotal',
    amount: date ? progress.projectedTotal - budget.amount : progress.projectedTotal,
    date,
  };
}
