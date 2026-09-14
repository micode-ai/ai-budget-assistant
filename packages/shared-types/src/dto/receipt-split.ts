/** One participant the payer is asking to settle up. */
export interface SplitParticipantInput {
  name: string;
  /** Ids of the expense_items assigned to this person. Empty = an equal-split share. */
  itemIds?: string[];
  /** Explicit share of a line, in basis points (6000 = 60%), keyed by item id
   * (ABA-550). Every key must also appear in `itemIds` — you cannot set a share
   * of a line you do not claim. A line left out here divides equally among its
   * claimants, which is what every split before this field did.
   *
   * The shares of one line need NOT add up to 10000: the remainder is the
   * payer's, the same way an unclaimed line already is. That is how "60% his,
   * 40% mine" is expressed — the payer is never a participant row. */
  itemShareBp?: Record<string, number>;
}

export interface CreateSplitDto {
  participants: SplitParticipantInput[];
  /** 'items' assigns line items; 'equal' divides the whole bill among payer + participants. */
  mode: 'items' | 'equal';
}

export type SplitParticipantStatus = 'sent' | 'opened' | 'claimed' | 'settled';

/** A guest's report that one line (or their whole share) is wrong — see
 * docs/contracts/guest-split-item-dispute.md. Only OPEN (unresolved) flags
 * are ever included in a `SplitParticipantState` — a resolved one simply
 * disappears from the next response. */
export interface SplitParticipantFlag {
  id: string;
  /** The expense_item id this flag is about, or null for a whole-share
   * report (equal-split mode, or "I wasn't in this split at all"). */
  itemId: string | null;
  /** Guest's optional free-text note. Plain text — never HTML. */
  note: string | null;
  createdAt: string;
}

export interface SplitParticipantState {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  status: SplitParticipantStatus;
  /** The shareable URL. Present only to the payer, never on the guest page. */
  url: string;
  /** Always present — empty array when there are no open flags. */
  flags: SplitParticipantFlag[];
  /** This participant's currently-claimed expense_item ids (ABA-546,
   * in-place line reassignment). Payer-view only — never rendered on the
   * guest page. Empty for an equal-mode split. */
  itemIds: string[];
  /** This participant's explicit per-line shares in basis points (ABA-550),
   * keyed by item id. Always present — an empty object means every line they
   * claim is divided equally. Payer-view only, like `itemIds`. */
  itemShareBp: Record<string, number>;
}

/**
 * Body of `PATCH :id/receipt-split/items/:itemId/reassign` (ABA-546) — lets
 * the payer fix ONE line's claimants in place instead of cancel-and-recreate.
 * See docs/contracts/receipt-split-in-place-reassignment.md.
 */
export interface ReassignSplitItemInput {
  /** The FULL new set of claimants for this line — replaces, not appends.
   * Empty array = nobody claims it any more (reverts fully to the payer).
   * Every id must be a live (non-cancelled) participant of this split. */
  participantIds: string[];
}

export interface SplitStateResponse {
  expenseId: string;
  /** The payer's own remainder — bill total minus the sum of participant shares. */
  ownShare: number;
  currencyCode: string;
  participants: SplitParticipantState[];
  /** Group picker URL — one QR-able link that resolves to a names-only picker
   * page, letting every participant scan the same code and pick their own
   * name (ABA — QR-code bill split). `null` for a split created before this
   * field existed (no backfill); callers must treat null as "no QR
   * available", not as an error. */
  groupUrl: string | null;
}

/** Distinct names this account has split receipts with before, most-recent
 * first — powers the mobile "people you've split with" suggestion chips on
 * the assignment screen, so the payer can tap a name instead of retyping it. */
export interface RecentSplitParticipantsResponse {
  names: string[];
}
