/**
 * What to do with the record that carries an email change between its two
 * steps.
 *
 * Changing an email is two steps with a server round trip between them: step 1
 * posts the new address and the current password and the API mails a 6-digit
 * code, step 2 submits the code. Between them there is one thing the user
 * cannot reconstruct — which address the code went to — so the moment the API
 * accepts the request the flow writes `{ newEmail, expiresAt }` to
 * `secureStorage`, 30 minutes ahead, BEFORE it shows the code field.
 *
 * Reading it back is the whole reason a half-finished change survives anything:
 * the app being killed, the phone restarting, and — since the desktop shell
 * hosts this flow in a dialog rather than a route — the dialog being closed.
 * All three are the same event to this function, because nothing writes it on
 * unmount and nothing may clear it on close.
 *
 * It lives here, pure and away from the screen, for the reason
 * `desktopTable.ts` and `settingsRegistry.ts` do: nothing in this repo renders
 * a component in CI, so a rule that decides whether a user's in-flight work is
 * resumed or thrown away can only be checked before a human sees it if it is a
 * function taking values and returning one.
 *
 * The three outcomes are deliberately distinct rather than a nullable result.
 * "Nothing was stored" and "what was stored is no longer usable" call for
 * different actions — the second must clear the key, the first must not touch
 * it — and collapsing them into `null` would put that difference back in the
 * caller, where it is invisible again.
 */

/** How the record is spelled in `secureStorage`. One writer, one reader. */
export const PENDING_EMAIL_CHANGE_KEY = 'pendingEmailChange';

/** Exactly what {@link PENDING_EMAIL_CHANGE_KEY} holds, as JSON. */
export interface PendingEmailChange {
  newEmail: string;
  /** ISO 8601, 30 minutes after the request was accepted. */
  expiresAt: string;
}

export type PendingEmailChangeOutcome =
  /** Nothing is stored. Show step 1. Do NOT write to the key. */
  | { status: 'none' }
  /**
   * Something is stored and it is no longer usable — expired, or not parseable
   * as the shape above. Show step 1 AND clear the key, so a dead record cannot
   * keep answering this question on every later open.
   */
  | { status: 'discard' }
  /** A live request. Show step 2, addressed to this email. */
  | { status: 'resume'; newEmail: string };

/**
 * @param raw What `secureStorage.getItem(PENDING_EMAIL_CHANGE_KEY)` returned —
 *   `null` when the key is absent.
 * @param now Injected rather than read from the clock, so expiry is testable;
 *   the convention every dated helper in this codebase follows.
 *
 * The expiry test is strictly greater, so a record whose deadline is exactly
 * `now` is spent. That is the safe direction: resuming a code the server has
 * already rejected sends the user to a field that can only fail, while
 * discarding one a second early costs a re-request the user is already at the
 * keyboard for.
 *
 * A record with an `expiresAt` that is not a date at all compares false here
 * (every comparison against `NaN` is false) and therefore discards, which is
 * the behaviour worth keeping rather than special-casing: unreadable is
 * unusable.
 */
export function resolvePendingEmailChange(raw: string | null, now: Date): PendingEmailChangeOutcome {
  if (!raw) return { status: 'none' };

  let parsed: PendingEmailChange;
  try {
    parsed = JSON.parse(raw) as PendingEmailChange;
  } catch {
    return { status: 'discard' };
  }

  if (!(new Date(parsed?.expiresAt) > now)) return { status: 'discard' };

  return { status: 'resume', newEmail: parsed.newEmail };
}
