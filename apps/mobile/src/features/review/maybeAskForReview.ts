import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { countTransactions } from '@/db/expenseRepository';
import { useAccountStore } from '@/stores/accountStore';
import { useReviewPromptStore } from '@/stores/reviewPromptStore';
import { requestStoreReview } from '@/services/storeReview';
import { shouldAskForReview } from './shouldAskForReview';

/** Lets the just-finished navigation settle before the system sheet appears. */
const SETTLE_MS = 700;

/**
 * Asks for a store rating if this user has earned the question and we have not
 * burnt the quota — see `shouldAskForReview` for the rules.
 *
 * A plain module function rather than a hook on purpose: every call site is an
 * Alert callback or a success handler, not a render (same shape as
 * `hydrateTransactions`).
 *
 * Fire-and-forget and never throws. A rating prompt is the least important
 * thing happening at any moment it runs, so every failure path — no account,
 * SQLite unavailable, native module missing — resolves silently.
 */
export async function maybeAskForReview(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;

    const { lastAskedAt, lastAskedVersion, markAsked } = useReviewPromptStore.getState();
    const currentVersion = Application.nativeApplicationVersion ?? '0.0.0';

    // One cheap indexed COUNT on local SQLite, at most once per success moment
    // — kept ahead of the decision so there is a single decision point rather
    // than the throttle rules half-inlined here as a fast path.
    const transactionCount = await countTransactions(accountId);

    if (
      !shouldAskForReview({
        transactionCount,
        lastAskedAt,
        lastAskedVersion,
        currentVersion,
        now: Date.now(),
      })
    ) {
      return;
    }

    // Marked BEFORE the request, not after: `requestStoreReview` resolves the
    // same way whether Play showed anything or dropped it for quota, so a
    // mark-on-success would re-fire on every later save and spend the budget
    // repeatedly for no gain.
    markAsked(currentVersion);

    setTimeout(() => {
      void requestStoreReview();
    }, SETTLE_MS);
  } catch {
    /* never let a rating prompt affect the flow that triggered it */
  }
}
