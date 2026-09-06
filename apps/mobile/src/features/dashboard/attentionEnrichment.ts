import type { AccountType, UserSubscription } from '@budget/shared-types';

/**
 * The boundary the two Phase B reads cross on their way into
 * "Needs your attention" (`docs/design/2026-09-05-dashboard-web.md`'s
 * phasing section: a purchase-request pending count and upcoming renewals).
 *
 * `buildAttentionItems` has accepted both inputs since it was written, and its
 * rules — the horizon, the sort, the `isActive` filter, the cap — are tested
 * there and are NOT repeated here. This module answers only the three
 * questions that arise from where the data comes from rather than what the
 * panel does with it:
 *
 *  1. Does the purchase-request read apply to this account at all?
 *  2. Do these subscriptions belong to the account currently on screen?
 *  3. Is each row's `daysUntilRenewal` a number we can compare against?
 *
 * It lives here, pure and tested, for the reason every other rule on this
 * screen does: nothing in this repo renders a component in CI, so a wrong
 * answer to any of the three renders perfectly.
 *
 * **Everything it does is subtractive.** Every branch below can only produce
 * FEWER rows, never a different or an invented one. That is the whole
 * disposition of Phase B: both reads are enrichment, so an attention list that
 * never receives them is simply shorter — never an error, never a placeholder.
 */

export interface AttentionEnrichmentInput {
  /**
   * `accountStore.currentAccountId`. Absent while the account list is still
   * settling, which is a legitimate "we do not know yet" rather than an error.
   */
  accountId: string | null | undefined;
  /** `currentAccount()?.type`. Absent for the same reason as `accountId`. */
  accountType: AccountType | undefined;
  /** `purchaseRequestStore.pendingCount` verbatim. */
  pendingPurchaseRequestCount: number;
  /** `userSubscriptionStore.subscriptions` verbatim. */
  subscriptions: UserSubscription[];
}

/** Exactly the two optional fields of `AttentionInputs`, ready to spread. */
export interface AttentionEnrichment {
  pendingPurchaseRequestCount: number;
  subscriptions: UserSubscription[];
}

/**
 * Whether a pending purchase-request count means anything on this account.
 *
 * A personal account has no other members to vote, so the request is not
 * merely empty — it is meaningless, and issuing it asks a question whose
 * answer is already known.
 *
 * An unknown type answers `false`, deliberately. `undefined !== 'personal'` is
 * `true`, so the obvious inequality would treat "the account list has not
 * loaded yet" as "definitely a shared account" and both fire the request and
 * show its row on a dashboard that does not yet know whose it is.
 *
 * Exported because it gates the REQUEST as well as the row, in
 * `DashboardDesktop`, and the two gates must be the same predicate: gating
 * only the request would leave a count fetched on a shared account still on
 * screen after a switch to a personal one, since nothing zeroes the store.
 */
export function isPurchaseRequestAccount(accountType: AccountType | undefined): boolean {
  return !!accountType && accountType !== 'personal';
}

/**
 * Narrow both raw store reads down to what this account can honestly show.
 *
 * ## Why subscriptions are filtered by account
 *
 * `userSubscriptionStore` is a plain server-backed list with no per-account
 * partition and nothing resets it on a switch, so between switching accounts
 * and the reload landing it still holds the PREVIOUS account's rows. Without
 * this filter the one block on the dashboard allowed to demand something would
 * briefly demand attention for another account's subscription, by name. Each
 * row carries the `accountId` the server scoped it to, so the check is exact.
 *
 * ## Why `daysUntilRenewal` is checked for being a number
 *
 * It has no column behind it — the API computes it per request in
 * `UserSubscriptionsService.mapSubscription` — and `httpClient.request<T>()`
 * is an unchecked cast, so nothing between the socket and the horizon filter
 * has ever verified its type. A missing or non-finite value would not fail
 * loudly: `null <= 7` is `true` and `undefined <= 7` is `false`, so the
 * horizon would either admit every subscription the account has (renewals a
 * year out, presented as this week's) or silently admit none. Verified against
 * production as always a finite number today; this keeps that a fact about the
 * data rather than an assumption of the arithmetic.
 *
 * A row we cannot place in time is dropped rather than guessed at — shorter,
 * per the rule above.
 */
export function resolveAttentionEnrichment({
  accountId,
  accountType,
  pendingPurchaseRequestCount,
  subscriptions,
}: AttentionEnrichmentInput): AttentionEnrichment {
  return {
    pendingPurchaseRequestCount: isPurchaseRequestAccount(accountType)
      ? pendingPurchaseRequestCount
      : 0,
    subscriptions: accountId
      ? subscriptions.filter(
          (s) => s.accountId === accountId && Number.isFinite(s.daysUntilRenewal),
        )
      : [],
  };
}
