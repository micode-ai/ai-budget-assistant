/**
 * When to ask for a Play Store rating.
 *
 * The store listing carries 13 reviews against a 10+ install bucket, because
 * nothing in the app has ever asked. Google's in-app review flow is the only
 * mechanism that converts at any real rate, but it is easy to burn: Play
 * silently drops a request that exceeds its own (undocumented, ~yearly) quota,
 * so a request we fire is a request we cannot fire again for a while and get
 * no signal either way. Everything here is therefore biased towards asking
 * rarely, at a moment the user has just succeeded at something.
 */

/** Never ask someone who has not actually used the app yet. */
export const MIN_TRANSACTIONS = 5;
/** Roughly matches Play's own quota window — asking sooner is wasted. */
export const MIN_DAYS_BETWEEN_ASKS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewPromptInputs {
  /**
   * Authoritative count from SQLite (`countTransactions`), NOT an in-memory
   * store — the stores fill after the cold-start gate opens, so an established
   * user reads as zero for a moment on every launch. Same trap as
   * `useFirstRunOnboarding`.
   */
  transactionCount: number;
  /** Epoch ms of the last request we fired, or null if we never have. */
  lastAskedAt: number | null;
  /** App version the last request was fired on, or null. */
  lastAskedVersion: string | null;
  /** `Application.nativeApplicationVersion`. */
  currentVersion: string;
  now: number;
}

/**
 * Pure so the throttle can be tested without MMKV, a navigator, or the native
 * Play module — mirrors `shouldShowFirstRun` / `computeColdStartGate`.
 *
 * Both throttles are load-bearing and neither implies the other: the version
 * check stops two asks inside one release (a user who scans ten receipts in an
 * evening), the 90-day check stops an ask per release for someone who updates
 * often.
 */
export function shouldAskForReview({
  transactionCount,
  lastAskedAt,
  lastAskedVersion,
  currentVersion,
  now,
}: ReviewPromptInputs): boolean {
  if (transactionCount < MIN_TRANSACTIONS) return false;
  if (lastAskedVersion !== null && lastAskedVersion === currentVersion) return false;
  if (lastAskedAt !== null && now - lastAskedAt < MIN_DAYS_BETWEEN_ASKS * DAY_MS) return false;
  return true;
}
