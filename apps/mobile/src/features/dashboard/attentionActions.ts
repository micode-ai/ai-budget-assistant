import { generateUUID } from '@budget/shared-utils';
import type { AnomalyAlert, BillingCycle, RecurringPeriod } from '@budget/shared-types';

/**
 * What a click on an ALERT row in "Needs your attention" does.
 *
 * The design's own rule is "a click that changes state resolves in place; a
 * click that changes subject may navigate" — and for alerts that is not one
 * rule but a PRECEDENCE, because the same row can satisfy three tests at once:
 *
 * - a `recurring_suggestion` alert carries an `expenseId` (the API sets
 *   `expenseId: expense.id` on it — `anomaly.service.ts`'s
 *   `detectRecurringSuggestion`), and so does
 * - a `possible_merge` alert (both in `params.expenseId` and in the column).
 *
 * So "does this alert reference an expense?" is true for all three kinds, and
 * a switch that asks that question first would open the expense dialog for a
 * recurring suggestion and never offer "Track it" at all — silently, on a row
 * that renders perfectly. That is the whole reason this is a tested function
 * rather than an `if` chain inside a component nothing in this repo's CI
 * renders.
 *
 * The order below is the one `app/alerts/index.tsx` already applies (recurring
 * first, merge second, expense last); mirrored rather than re-derived, so the
 * dashboard and the alerts screen can never disagree about what an alert is
 * for.
 */
export type AlertAction =
  /** Offer the inline "Track this subscription" button. No navigation. */
  | 'track'
  /** A two-expense merge — a real screen with real choices. Navigates out. */
  | 'merge'
  /** Open the expense in `ExpenseDialog`, in place. */
  | 'expense'
  /** Nothing to do: no target, or a viewer who may not write. */
  | 'none';

/**
 * `canEdit` is part of the decision, not a wrapper around it. `track` and
 * `merge` both end in a write the server blocks for a viewer
 * (`ViewerBlockGuard`), so offering either to a viewer is offering a button
 * that can only fail. Opening an expense read-only is fine for a viewer, which
 * is why only that branch survives `canEdit === false` — matching
 * `app/alerts/index.tsx`, which gates the first two and leaves the third
 * ungated.
 */
export function alertAction(alert: AnomalyAlert, canEdit: boolean): AlertAction {
  if (alert.type === 'recurring_suggestion') return canEdit ? 'track' : 'none';
  if (alert.type === 'possible_merge') return canEdit ? 'merge' : 'none';
  return alert.expenseId ? 'expense' : 'none';
}

/**
 * The two expense ids a `possible_merge` row hands the merge screen, in the
 * order it expects them: `aId` is the expense that triggered the alert, `bId`
 * the other candidate. Read from `params` first with the column as fallback,
 * exactly as `app/alerts/index.tsx` reads them.
 */
export function mergeTargets(alert: AnomalyAlert): { aId: string; bId: string } {
  const p = alert.params as Record<string, string>;
  return {
    aId: p.expenseId ?? alert.expenseId ?? '',
    bId: p.otherExpenseId ?? '',
  };
}

/** The payload `userSubscriptionStore.createSubscription` takes, narrowed to
 *  the fields this path can honestly fill in. */
export interface TrackedSubscriptionInput {
  name: string;
  amount: number;
  currencyCode: string;
  billingCycle: BillingCycle;
  /** `YYYY-MM-DD` — the shape the DTO and `subscriptions/new.tsx` both use. */
  nextRenewalDate: string;
  detectedFrom: string;
}

/**
 * Only the two cycles the detector can emit (`detectCycle` returns
 * `'weekly' | 'monthly'`, or nothing at all). Any other value in
 * `params.cycle` is a payload this client does not understand, and guessing
 * at it is worse than declining — `buildTrackedSubscription` returns `null`
 * and the row keeps its Track button unpressed rather than tracking a
 * subscription on a made-up schedule.
 */
const CYCLE_STEP: Partial<Record<BillingCycle, (d: Date) => void>> = {
  weekly: (d) => d.setDate(d.getDate() + 7),
  monthly: (d) => d.setMonth(d.getMonth() + 1),
};

/**
 * `toISOString().split('T')[0]` is deliberately NOT used, even though
 * `app/subscriptions/new.tsx` uses it: it routes through UTC and shifts the
 * calendar day for any non-zero offset — the exact defect ABA-381 fixed across
 * every date field in this app. Built from local components instead, the rule
 * `src/utils/dateInput.ts` states.
 */
function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Build the `createSubscription` payload for a `recurring_suggestion`, or
 * return `null` when the alert does not carry enough to build one honestly.
 *
 * Every field here is a small derivation that renders perfectly when wrong,
 * which is why it is tested rather than inlined:
 *
 * - **`amount` arrives as a STRING** (`Number(expense.amount).toFixed(2)` on
 *   the server). Passing it through would post a string where the DTO wants a
 *   number; coercing it without a guard would post `NaN`, which serialises to
 *   `null` in JSON — a subscription with no amount, or a 422 the user sees as
 *   "nothing happened".
 * - **`billingCycle` must come from the alert's own `cycle`**, which the
 *   detector derived from at least three real charges.
 *   `app/subscriptions/new.tsx` hardcodes `'monthly'` because it hands the
 *   user a form to correct it; this path has no form, so a weekly charge
 *   tracked as monthly under-reports the user's real commitment by ~4.3x in
 *   the "monthly equivalent" total, for ever, with nothing on screen to hint
 *   at it.
 * - **`nextRenewalDate` is not in the alert at all** and must be derived. One
 *   cycle from today is the only defensible guess — the detector fires on a
 *   charge that has just happened, so the next one is one cycle away. It also
 *   has to be in the FUTURE: the renewal-reminder cron pushes three days
 *   before this date and the auto-charge cron books an expense once it is
 *   reached, so a date invented in the past would fire a reminder immediately
 *   and mint a duplicate expense the same night.
 *
 * `now` is injected rather than read off the clock so the date arithmetic is
 * testable — the same convention the API's `admin-metrics.util.ts` uses.
 */
export function buildTrackedSubscription(
  alert: AnomalyAlert,
  now: Date,
  fallbackCurrency: string,
): TrackedSubscriptionInput | null {
  if (alert.type !== 'recurring_suggestion') return null;

  const p = alert.params as Record<string, unknown>;

  const name = typeof p.merchant === 'string' ? p.merchant.trim() : '';
  if (!name) return null;

  // `Number()`, never `parseFloat`: `parseFloat('12abc')` is 12, which would
  // quietly track a subscription at a price nobody was ever charged.
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const billingCycle = p.cycle as BillingCycle;
  const step = CYCLE_STEP[billingCycle];
  if (!step) return null;

  const next = new Date(now.getTime());
  step(next);

  return {
    name,
    amount,
    // The alert's own currency, never the user's display currency: the charge
    // happened in the currency the expense was booked in, and relabelling it
    // would restate the amount without converting it.
    currencyCode: (typeof p.currencyCode === 'string' && p.currencyCode) || fallbackCurrency,
    billingCycle,
    nextRenewalDate: toIsoDay(next),
    // The same value `app/subscriptions/new.tsx` passes, so a subscription
    // created from this row is indistinguishable from one created there.
    detectedFrom: name,
  };
}

/**
 * The `expenseStore.updateExpense` patch that flags a `recurring_suggestion`
 * alert's own triggering expense as recurring — the ABA-523 gap
 * (`recurring-bill-detection-nudge`): the budget-projection fix excludes the
 * single largest day's spend from the daily burn rate, but nothing ever
 * offered to mark a genuinely recurring bill (rent, a subscription entered by
 * hand) as such, so it kept re-arming that same heuristic every month. This
 * is deliberately a SIBLING action on the SAME `recurring_suggestion` alert
 * `buildTrackedSubscription` already handles, not a new alert type or a new
 * server-side detector: the detector's 3-occurrence monthly/weekly-cadence
 * signal is exactly the evidence this action needs too, and the fields it
 * writes (`isRecurring`/`recurringId`/`recurringPeriod`) already exist on
 * `Expense` and are already read by `expense-recurring.cron.ts` and
 * `SafeToSpendService`'s upcoming-obligations input — no server change at
 * all, just a client-side write through the existing `PATCH /expenses/:id`.
 *
 * Returns `null` when the alert cannot honestly identify which expense to
 * mark (see `recurring_suggestion`'s own comment on why `expenseId` is
 * always set by the detector — this is belt-and-braces, matching
 * `buildTrackedSubscription`'s own defensive style) or carries a cycle this
 * client does not recognise. `RecurringPeriod` ('weekly'|'monthly'|'yearly')
 * and the detector's own `cycle` ('monthly'|'weekly') share their string
 * values for both cases the detector can emit, so — unlike
 * `buildTrackedSubscription`'s `CYCLE_STEP` table — no translation is needed
 * here; a value outside that pair (or a future third cycle the detector
 * learns to emit) is refused rather than guessed at.
 *
 * `recurringId` is generated CLIENT-SIDE and sent as-is, mirroring
 * `ExpenseCreateForm.tsx`'s own Repeat-toggle flow (`generateUUID()`) — the
 * server's `UpdateExpenseDto.recurringId` already accepts a client-supplied
 * UUID (`@IsUUID()`), so there is no second round trip to learn a
 * server-generated id before the local optimistic write can apply it.
 *
 * Only the TRIGGERING expense is tagged, never prior occurrences: the
 * recurring cron clones forward from the latest dated row in a
 * `recurringId` series regardless of what came before it, and silently
 * rewriting historical rows the user never asked to change would be a
 * surprise, not a fix.
 */
export interface MarkRecurringUpdate {
  expenseId: string;
  isRecurring: true;
  recurringId: string;
  recurringPeriod: RecurringPeriod;
}

const RECURRING_CYCLE_TO_PERIOD: Partial<Record<string, RecurringPeriod>> = {
  monthly: 'monthly',
  weekly: 'weekly',
};

/**
 * `generateId` is injected (default `generateUUID`) rather than called
 * directly, the same "inject what varies" seam `admin-metrics.util.ts`
 * applies to `now` — it is what lets a test assert the exact id that reaches
 * `expenseStore.updateExpense` instead of only asserting "some string came
 * back".
 */
export function buildMarkRecurringUpdate(
  alert: AnomalyAlert,
  generateId: () => string = generateUUID,
): MarkRecurringUpdate | null {
  if (alert.type !== 'recurring_suggestion') return null;
  if (!alert.expenseId) return null;

  const p = alert.params as Record<string, unknown>;
  const recurringPeriod = RECURRING_CYCLE_TO_PERIOD[typeof p.cycle === 'string' ? p.cycle : ''];
  if (!recurringPeriod) return null;

  return {
    expenseId: alert.expenseId,
    isRecurring: true,
    recurringId: generateId(),
    recurringPeriod,
  };
}
