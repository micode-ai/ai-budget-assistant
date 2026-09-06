import type { FirstRunNext } from '@/stores/firstRunStore';

/**
 * Three-valued on purpose.
 *
 * `'wait'` is the state a boolean cannot hold: we have asked the server and it
 * has not answered. On web `db/client.web.ts` is an in-memory mock, so every
 * SQLite read returns empty, and `_doPullAndMerge` swallows a failed pull with
 * `console.warn` while setting no flag (`error` is only set for a SQLite
 * failure, which never happens there). So an empty in-memory list means
 * *either* "this account is empty" *or* "the request never came back", and a
 * boolean predicate reads the second as the first — interrupting a user with
 * years of history to tell them they are new.
 *
 * `'wait'` renders neither the first-run state nor the ordinary empty cards.
 */
export type WebFirstRunOutcome = 'wait' | 'show' | 'suppress';

export interface WebFirstRunInputs {
  /** The shared "app is fully ready" gate — see useColdStartGate. */
  gateOpen: boolean;
  /**
   * Device-local flag from `firstRunStore`. MMKV is localStorage-backed on
   * web, so this genuinely persists per browser.
   */
  seen: boolean;
  /** A viewer cannot create a transaction, so has nothing to be onboarded to. */
  canEdit: boolean;
  /** With no account selected, a zero count describes nothing. */
  accountId: string | null;
  /**
   * Where onboarding hands off once finished, set synchronously by the
   * email-verification path *before* it navigates. Non-null means that path
   * already owns navigation.
   */
  nextAfter: FirstRunNext | null;
  /** `expenseStore.lastPullAt` — `null` = no successful pull this session. */
  expensesPullAt: number | null;
  /** `incomeStore.lastPullAt` — same. */
  incomesPullAt: number | null;
  expenseCount: number;
  incomeCount: number;
}

/**
 * Whether the desktop dashboard should render its first-run state.
 *
 * Pure, so the decision is testable without a store or a navigator — mirroring
 * `shouldShowFirstRun`, which this deliberately does not extend. That one is
 * native's: it reads an authoritative SQLite count, which on web is always
 * zero, and it answers a different question (should we *navigate* to
 * `/get-started`) with different inputs.
 *
 * ## Two guards carried over from `shouldShowFirstRun` / `useFirstRunOnboarding`
 *
 * 1. **A viewer is suppressed.** Every entry point the first-run state offers
 *    is blocked server-side by `ViewerBlockGuard`, so offering it is a dead
 *    end, not merely redundant.
 * 2. **A pending `nextAfter` is suppressed.** The email-verification path has
 *    already sent this user to `/get-started` with a destination attached. A
 *    second, independent decision here races that navigation, and losing the
 *    race silently deletes the pricing screen from the registration funnel.
 *    The flag is written *before* that navigation rather than observed after
 *    it, which is what makes reading it here deterministic.
 *
 * Both are evaluated **before** the wait check: a viewer whose pull has not
 * answered is still a viewer, and answering `'wait'` there would leave the
 * dashboard in a loading state that nothing will ever resolve.
 *
 * ## Failing in the safe direction
 *
 * A permanently offline user never reaches `'show'`. That is deliberate:
 * never claim someone is new without evidence. It is also today's behaviour,
 * so it is not a regression.
 */
export function resolveWebFirstRun({
  gateOpen,
  seen,
  canEdit,
  accountId,
  nextAfter,
  expensesPullAt,
  incomesPullAt,
  expenseCount,
  incomeCount,
}: WebFirstRunInputs): WebFirstRunOutcome {
  // Ordering is load-bearing: a failing guard wins over a missing answer.
  if (!gateOpen || !canEdit || !accountId || seen || nextAfter) return 'suppress';

  // `null`, not falsy — a pull that legitimately landed must never read as
  // absent, or the dashboard waits forever.
  if (expensesPullAt === null || incomesPullAt === null) return 'wait';

  // Both pulls answered, so the count is now evidence rather than an artefact
  // of web's mock SQLite. Either kind of transaction means an activated user.
  if (expenseCount + incomeCount > 0) return 'suppress';

  return 'show';
}
