/**
 * What each first-run entry card actually does when clicked.
 *
 * ## Why this is a module and not four `router.push` calls
 *
 * The first-run panel exists to stop a new user leaving before they have any
 * data. Its own thesis is that **navigating away IS the user leaving** — so an
 * entry that opens a full-screen route contradicts the screen it sits on. Three
 * of the four therefore open a dialog over the dashboard; one does not.
 *
 * That split is a decision that can be silently reverted (delete a line from
 * `CAPTURE_DIALOGS` and the entry quietly becomes a page again, with nothing
 * failing and nothing rendering in this repo's CI to notice). It is a table, so
 * it lives here where a test can read it, rather than inside a `.tsx` no test
 * can reach.
 *
 * ## Why "Bring your history" stays a page — deliberately, not by omission
 *
 * `/settings/import` is a multi-step wizard: pick a file, review a parsed
 * preview, map columns when the parser did not recognise the format, then
 * commit. It owns its own navigation between those steps (`app/settings/import/`
 * is four routes, not one), and each step is denser than the one before. Boxing
 * a wizard that navigates internally inside a dialog that also wants to own
 * dismissal makes both worse: the dialog's Esc/scrim would have to mean
 * "abandon the whole import" at every step, and a column mapper is the one
 * screen on this list that wants MORE width, not less. It is also the only
 * entry the user cannot finish in one gesture, so the "they left and did not
 * come back" risk the dialogs mitigate does not apply the same way — the file
 * picker already takes them out of the app regardless.
 */

/** The three capture flows that open over the dashboard instead of replacing it. */
export type CaptureKind = 'receipt' | 'manual' | 'voice';

export const ENTRY_ROUTE_IMPORT = '/settings/import';
export const ENTRY_ROUTE_RECEIPT = '/expense/receipt';
export const ENTRY_ROUTE_MANUAL = '/expense/new';
export const ENTRY_ROUTE_VOICE = '/expense/voice';

/**
 * Route -> dialog. Keyed by the route each card used to push, so the panel's
 * card table keeps naming a real, still-registered route (the phone still
 * navigates to all four) and this is purely a desktop redirection of it.
 *
 * **A `Map`, not an object literal.** An object literal answers a lookup of
 * `constructor`/`toString` with a truthy inherited member, so those routes
 * would resolve to `{ kind: 'dialog', dialog: <a function> }` and crash the
 * call site rather than merely opening the wrong screen. Same
 * `Object.prototype` false-positive class the AI-import mapping validator
 * avoids with a `Set`. Caught by its own test, not by review.
 */
const CAPTURE_DIALOGS: ReadonlyMap<string, CaptureKind> = new Map([
  [ENTRY_ROUTE_RECEIPT, 'receipt'],
  [ENTRY_ROUTE_MANUAL, 'manual'],
  [ENTRY_ROUTE_VOICE, 'voice'],
] as const);

export type EntryAction =
  | { kind: 'dialog'; dialog: CaptureKind }
  | { kind: 'navigate'; route: string };

/**
 * Resolve one entry card's click.
 *
 * **Unknown routes navigate.** Navigating is the behaviour every entry had
 * before dialogs existed and the behaviour the phone still has, so an entry
 * added later without a dialog built for it degrades to a working page rather
 * than to a dead card. Failing towards "it still works" is the same asymmetry
 * `resolveWebFirstRun` applies.
 */
export function resolveEntryAction(route: string): EntryAction {
  const dialog = CAPTURE_DIALOGS.get(route);
  return dialog ? { kind: 'dialog', dialog } : { kind: 'navigate', route };
}
