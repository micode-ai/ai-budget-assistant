import type { ItemAssignments } from './itemAssignments';
import { BP_FULL, hasExplicitShares, type ItemShares } from './itemShares';

export interface ParticipantAssignmentSummary {
  count: number;
  /** CLIENT-SIDE aggregate of this participant's assigned item prices —
   * guidance only, rendered on the chip with a "~" prefix and muted styling.
   * NEVER the authoritative amount: only the server computes each
   * participant's real `amount` and the payer's `ownShare` (see
   * `validateSplit.ts`'s docstring — this mirrors its
   * `SplitParticipantCandidate.shareAmount` comment). */
  subtotal: number;
}

/**
 * Per-participant item count + subtotal for the receipt-split assignment
 * chips (`ParticipantChips.tsx`), keyed by participant id so a chip can look
 * its own summary up directly (`validateSplit.ts`'s aggregation is keyed by
 * name instead, which is fine for its own overBill-guard purpose but would
 * collide if two participants happened to share a name).
 *
 * A line several people claimed contributes only this participant's SHARE of
 * it — a hand-set share when the payer gave one (ABA-550), otherwise
 * `price / claimants`, mirroring the server's `resolveItemSplit`. Adding
 * the whole price to each of them would put a number on the chip that the
 * server will never agree with, and would trip the over-bill guard on a split
 * that is perfectly valid (three people on one bottle would read as three
 * bottles).
 *
 * Every id in `participantIds` gets an entry — `{ count: 0, subtotal: 0 }`
 * for one with nothing assigned yet — so the "0 items" warning state (see
 * `ParticipantChips.tsx`) can render for them too, rather than silently
 * omitting them from the map. `count` stays a plain count of lines the person
 * is on, shared or not: "2 items" is the honest answer for someone on two
 * lines, whatever the other claimants do.
 *
 * Pure and unit-tested; `AssignmentEditor.tsx` is the only caller.
 */
export function computeParticipantAssignmentSummaries(
  participantIds: string[],
  assignments: ItemAssignments,
  priceByItemId: Map<string, number>,
  itemShares: ItemShares = {},
): Record<string, ParticipantAssignmentSummary> {
  const summaries: Record<string, ParticipantAssignmentSummary> = {};
  for (const id of participantIds) {
    summaries[id] = { count: 0, subtotal: 0 };
  }
  for (const [itemId, participantIds_] of Object.entries(assignments)) {
    // Claimants that no longer exist must not shrink everyone else's share:
    // divide by the people actually still on the line.
    const claimants = participantIds_.filter((id) => summaries[id] !== undefined);
    if (claimants.length === 0) continue;
    const price = priceByItemId.get(itemId) ?? 0;
    // A hand-split line prices each claimant by their own share; a claimant left
    // without one on such a line takes nothing, exactly as the server does —
    // falling back to an equal slice here would put a number on the chip the
    // server will never agree with.
    const manual = hasExplicitShares(itemShares, itemId);
    for (const participantId of claimants) {
      const summary = summaries[participantId];
      summary.count += 1;
      summary.subtotal += manual
        ? (price * ((itemShares[itemId]?.[participantId] ?? 0) / BP_FULL))
        : price / claimants.length;
    }
  }
  return summaries;
}
