/**
 * When to offer "invite a friend" on a finished bill split.
 *
 * The referral loop has working economics (bonus AI requests for the inviter, a
 * longer trial for the friend) and, since ABA-486, a link that actually
 * pre-fills the code — but nothing in the app has ever asked anyone to use it.
 * A row in Settings is not an ask.
 *
 * The moment chosen is the one where the pitch is TRUE rather than merely
 * frequent: a friend has just paid the user back through a page we served, so
 * the product has demonstrably worked for both of them and the friend already
 * knows what it is. The home screen would reach more people and mean nothing.
 *
 * It is an inline card, never a modal — see `InviteFriendsCard`. The two prompts
 * that do interrupt (the store-rating sheet, ABA-485) fire on the receipt-scan
 * and Wrapped-share paths, deliberately not this one: stacking a second ask on
 * the same success is how both get dismissed.
 */

/** A settled participant is the whole precondition — nothing to celebrate before that. */
export const MIN_SETTLED = 1;
/** Long enough that someone who splits bills weekly is not asked weekly. */
export const MIN_DAYS_BETWEEN_OFFERS = 60;
/** Two refusals is an answer. Asking a third time is nagging. */
export const MAX_DISMISSALS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface InviteOfferInputs {
  /** Participants on this split whose payment the payer has confirmed. */
  settledCount: number;
  /** A viewer cannot act on the split, and shouldn't be pitched on it either. */
  canEdit: boolean;
  /** Epoch ms of the last time the card was shown, or null. */
  lastShownAt: number | null;
  /** How many times the user has closed the card without acting. */
  dismissals: number;
  now: number;
}

/**
 * Pure so the rules can be tested without MMKV or a rendered screen — mirrors
 * `shouldAskForReview` and `shouldShowFirstRun`.
 */
export function shouldOfferInvite({
  settledCount,
  canEdit,
  lastShownAt,
  dismissals,
  now,
}: InviteOfferInputs): boolean {
  if (!canEdit) return false;
  if (settledCount < MIN_SETTLED) return false;
  if (dismissals >= MAX_DISMISSALS) return false;
  if (lastShownAt !== null && now - lastShownAt < MIN_DAYS_BETWEEN_OFFERS * DAY_MS) {
    return false;
  }
  return true;
}
