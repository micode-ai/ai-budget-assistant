/**
 * Pure guard for the receipt-split creation screen (`app/expense/split.tsx`),
 * mirroring the validation `ReceiptSplitService.createSplit` performs
 * server-side (`apps/api/src/modules/receipt-split/receipt-split.service.ts`
 * — `MAX_PARTICIPANTS = 20`, blank-name rejection, participant shares must
 * not exceed the bill total) so the screen can disable Create before ever
 * making the request, instead of only surfacing a raw server 400.
 *
 * Same shape as `validateTripSplit` in
 * `src/components/expenses/TripExpenseSplitPicker.tsx`: a pure boolean guard,
 * unit-tested directly, used to disable submit.
 *
 * `shareAmount` is a CLIENT-COMPUTED aggregate used ONLY to catch an
 * obviously-invalid submission before it reaches the server (e.g. a
 * discounted receipt whose assigned line-item prices sum to more than what
 * was actually paid). It is never the authoritative amount — the server
 * alone computes each participant's real `amount` and the payer's
 * `ownShare` (`SplitStateResponse`), and nothing derived from this guard may
 * be rendered as "your share" or a participant's final total.
 */
export interface SplitParticipantCandidate {
  name: string;
  /** Client-side estimate of this participant's assigned total, for the
   * overBill guard only — never displayed as an authoritative amount. */
  shareAmount: number;
}

/** Mirrors `MAX_PARTICIPANTS` in `receipt-split.service.ts`. */
export const MAX_SPLIT_PARTICIPANTS = 20;

/** Mirrors `AMOUNT_TOLERANCE` in `receipt-split.service.ts`. */
const SHARE_TOLERANCE = 0.01;

export function validateSplit(
  participants: SplitParticipantCandidate[],
  billTotal: number,
): boolean {
  if (participants.length === 0) return false;
  if (participants.length > MAX_SPLIT_PARTICIPANTS) return false;
  if (participants.some((p) => p.name.trim().length === 0)) return false;

  const sum = participants.reduce((acc, p) => acc + p.shareAmount, 0);
  if (sum > billTotal + SHARE_TOLERANCE) return false;

  return true;
}
