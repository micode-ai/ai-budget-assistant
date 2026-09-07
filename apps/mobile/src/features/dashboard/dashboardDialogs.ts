/**
 * Which desktop-dashboard actions open a dialog over the dashboard, and which
 * genuinely navigate.
 *
 * ## Why one table for the whole screen
 *
 * Three separate surfaces offer overlapping entry points: the first-run panel's
 * entry cards, the setup checklist's steps, and the ordinary dashboard rail's
 * quick actions. Four routes appear on more than one of them. When each surface
 * decided for itself, the same action was a dialog in one place and a
 * full-screen push in another — "Scan a receipt" opened over the dashboard on
 * day one and replaced it on day two. One table means they cannot disagree.
 *
 * The rule behind the table: on this screen, **navigating away IS the user
 * leaving**, and a dashboard whose every affordance replaces it is a dashboard
 * nobody returns to. So anything that can be finished in one sitting resolves
 * in place.
 *
 * ## Why the import wizard is the exception
 *
 * `/settings/import` is four routes, not one — hub, preview, column mapper,
 * request-a-bank — and it navigates between them itself. Boxing that inside a
 * dialog that also wants to own dismissal makes both worse: Esc and the scrim
 * would have to mean "abandon the whole import" at every step, and the column
 * mapper is the one screen on this list that wants MORE width, not less. It is
 * also the only entry the user cannot finish in one gesture, so the "they left
 * and never came back" risk the dialogs mitigate does not apply the same way —
 * the OS file picker takes them out of the app regardless.
 *
 * ## Why it is a module and not a `router.push` at each call site
 *
 * This is a table, and a table that decides something invisible: delete a line
 * and the entry quietly becomes a full-screen page again, with nothing failing
 * and nothing in this repo's CI rendering a component to notice. Here, a test
 * can read it.
 */

/** Every dialog the desktop dashboard can open in place of a navigation. */
export type DashboardDialogKind =
  /** `CreateDialog kind="expense"` — hosts `ExpenseCreateForm`. */
  | 'expense'
  /** `CreateDialog kind="income"` — hosts `IncomeCreateForm`. */
  | 'income'
  /** `ReceiptDialog` — hosts `ReceiptExpenseView`. */
  | 'receipt'
  /** `VoiceDialog` — hosts `VoiceExpenseView`. */
  | 'voice'
  /** `BudgetCreateDialog` — hosts `BudgetCreateForm`. */
  | 'budget'
  /** `SetBalanceDialog` — hosts `SetBalanceView`. */
  | 'wallet';

export const ROUTE_IMPORT = '/settings/import';
export const ROUTE_EXPENSE_NEW = '/expense/new';
export const ROUTE_INCOME_NEW = '/income/new';
export const ROUTE_RECEIPT = '/expense/receipt';
export const ROUTE_VOICE = '/expense/voice';
export const ROUTE_BUDGET_NEW = '/budget/new';
export const ROUTE_SET_BALANCE = '/wallet/set-balance';

/**
 * Route -> dialog.
 *
 * Keyed by the route each surface used to push, so every card, step and button
 * keeps naming a real, still-registered destination — the phone still navigates
 * to all of them — and this stays a desktop redirection rather than a second
 * routing scheme.
 *
 * **A `Map`, not an object literal.** An object literal answers a lookup of
 * `constructor`/`toString` with a truthy inherited member, so those routes
 * would resolve to `{ kind: 'dialog', dialog: <a function> }` and crash the
 * call site rather than merely opening the wrong screen. Same
 * `Object.prototype` false-positive class the AI-import mapping validator
 * avoids with a `Set`. Caught by this module's own test, not by review.
 */
const ROUTE_DIALOGS: ReadonlyMap<string, DashboardDialogKind> = new Map([
  [ROUTE_EXPENSE_NEW, 'expense'],
  [ROUTE_INCOME_NEW, 'income'],
  [ROUTE_RECEIPT, 'receipt'],
  [ROUTE_VOICE, 'voice'],
  [ROUTE_BUDGET_NEW, 'budget'],
  [ROUTE_SET_BALANCE, 'wallet'],
] as const);

export type DialogAction =
  | { kind: 'dialog'; dialog: DashboardDialogKind }
  | { kind: 'navigate'; route: string };

/**
 * Resolve one entry's click.
 *
 * **Unknown routes navigate.** Navigating is the behaviour every entry had
 * before dialogs existed and the behaviour the phone still has, so an entry
 * added later without a dialog built for it degrades to a working page rather
 * than to a dead control. Failing towards "it still works" is the same
 * asymmetry `resolveWebFirstRun` applies.
 */
export function resolveDialogAction(route: string): DialogAction {
  const dialog = ROUTE_DIALOGS.get(route);
  return dialog ? { kind: 'dialog', dialog } : { kind: 'navigate', route };
}
