import type { WebFirstRunOutcome } from './resolveWebFirstRun';

/**
 * How long the dashboard will hold its loading state waiting for the two
 * transaction pulls to answer, before giving up and rendering the ordinary
 * dashboard.
 *
 * `resolveWebFirstRun` answers `'wait'` for as long as either pull is
 * unanswered, and on web a failed pull is swallowed with `console.warn` and
 * sets no flag — so a permanently offline user would sit at `'wait'` for ever,
 * looking at a spinner that nothing will ever resolve. Same reason and same
 * shape as `attemptRestoreSession`'s `RESTORE_TIMEOUT_MS`, which bounds a
 * native call that runs before the first screen draws.
 *
 * Five seconds is long enough that a slow-but-working connection is not cut
 * off mid-answer, and short enough that a broken one does not read as a hung
 * app.
 */
export const FIRST_RUN_WAIT_TIMEOUT_MS = 5000;

/** What the desktop dashboard actually draws. */
export type FirstRunView =
  /** One centred spinner in the focus column, the rail empty. */
  | 'wait'
  /** The start panel: heading, the 2x2 entry grid, the skip link. */
  | 'first-run'
  /** Today's dashboard, unchanged. */
  | 'dashboard';

export interface FirstRunViewInputs {
  outcome: WebFirstRunOutcome;
  /** True once `FIRST_RUN_WAIT_TIMEOUT_MS` has elapsed with the outcome still `'wait'`. */
  waitTimedOut: boolean;
}

/**
 * Turns the three-valued predicate plus the wait bound into the one thing the
 * dashboard renders.
 *
 * **The timeout wins over everything, including a later `'show'`.** Once the
 * bound has elapsed the ordinary dashboard is the answer whatever the pull
 * eventually says. The asymmetry is deliberate: showing a user with years of
 * history an "add your first expense" screen is the harm; showing a genuinely
 * new user today's empty dashboard is merely today's behaviour. Without this,
 * a pull landing at 7s would flip a settled dashboard into the first-run state
 * five seconds after the user had started reading it.
 *
 * The cost is bounded and self-healing: nothing marks `seen`, so a new user on
 * a slow connection loses first-run for that one page load and gets it on the
 * next.
 */
export function resolveFirstRunView({ outcome, waitTimedOut }: FirstRunViewInputs): FirstRunView {
  if (waitTimedOut) return 'dashboard';
  if (outcome === 'wait') return 'wait';
  if (outcome === 'show') return 'first-run';
  return 'dashboard';
}

export interface PullEvidenceInputs {
  /** `expenseStore.lastPullAt` — `null` = no successful pull this session. */
  expensesPullAt: number | null;
  /** `incomeStore.lastPullAt` — same. */
  incomesPullAt: number | null;
}

export interface ActivityEvidenceInputs extends PullEvidenceInputs {
  expenseCount: number;
  incomeCount: number;
}

/**
 * Have both transaction pulls answered this session?
 *
 * `=== null`, never falsy: `lastPullAt` is a `Date.now()` millisecond stamp,
 * and while `0` cannot occur in practice, reading a legitimate answer as
 * absent is the failure that leaves the dashboard waiting for ever.
 */
export function hasPullAnswered({ expensesPullAt, incomesPullAt }: PullEvidenceInputs): boolean {
  return expensesPullAt !== null && incomesPullAt !== null;
}

/**
 * Positive evidence that this account holds transactions.
 *
 * **Deliberately not "the outcome was `'suppress'`".** That value also covers a
 * viewer, a missing account, a pending `nextAfter` and a shut gate — and this
 * boolean is what marks `seen`, which is permanent. Marking `seen` off any of
 * those would silently delete the first-run state for a user who has never
 * been shown it, which is exactly the failure the three-valued predicate
 * exists to prevent, one level further down.
 *
 * A count is only evidence once the server has answered, because on web
 * SQLite is a mock and every local read returns empty.
 */
export function hasActivityEvidence(inputs: ActivityEvidenceInputs): boolean {
  if (!hasPullAnswered(inputs)) return false;
  return inputs.expenseCount + inputs.incomeCount > 0;
}

export interface MarkSeenInputs extends ActivityEvidenceInputs {
  /** The shared "app is fully ready" gate. */
  gateOpen: boolean;
  /** `firstRunStore.seen`. Already-set means there is nothing to write. */
  seen: boolean;
}

/**
 * The exit condition, in one place.
 *
 * The spec: the first-run state ends when a transaction lands or when the skip
 * link is clicked, and *both* leave `seen === true` so a refresh does not bring
 * it back. The skip link writes the flag directly; this covers the other half —
 * and it covers a second case the skip link cannot, the established user who is
 * never shown the state at all. Marking `seen` on their first answered pull is
 * what makes "must not flip back to first-run on a later empty pull" true for
 * them, permanently and across reloads, rather than for the lifetime of one
 * component instance the way a `useRef` latch would.
 *
 * Native's `useFirstRunOnboarding` does exactly this ("a non-empty account
 * marks the flag seen"), for the same reason. `seen` has always been a property
 * of the install rather than of the account, so a second, genuinely empty
 * account opened in the same browser afterwards does not get the state — which
 * is native's behaviour too, and deliberate there.
 *
 * `gateOpen` is a condition and not an assumption: this writes a permanent
 * flag, and a reading taken before the app is ready is not evidence of
 * anything.
 */
export function shouldMarkFirstRunSeen({ gateOpen, seen, ...evidence }: MarkSeenInputs): boolean {
  if (!gateOpen || seen) return false;
  return hasActivityEvidence(evidence);
}
