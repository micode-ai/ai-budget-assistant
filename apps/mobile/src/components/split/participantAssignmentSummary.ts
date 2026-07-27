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
 * Every id in `participantIds` gets an entry — `{ count: 0, subtotal: 0 }`
 * for one with nothing assigned yet — so the "0 items" warning state (see
 * `ParticipantChips.tsx`) can render for them too, rather than silently
 * omitting them from the map.
 *
 * Pure and unit-tested; `app/expense/split.tsx` is the only caller.
 */
export function computeParticipantAssignmentSummaries(
  participantIds: string[],
  assignments: Record<string, string>,
  priceByItemId: Map<string, number>,
): Record<string, ParticipantAssignmentSummary> {
  const summaries: Record<string, ParticipantAssignmentSummary> = {};
  for (const id of participantIds) {
    summaries[id] = { count: 0, subtotal: 0 };
  }
  for (const [itemId, participantId] of Object.entries(assignments)) {
    const summary = summaries[participantId];
    // An assignment can reference a participant who has since been removed —
    // `handleRemoveParticipant` in split.tsx already cleans these up, but
    // stay defensive rather than crash or invent a stray map entry.
    if (!summary) continue;
    summary.count += 1;
    summary.subtotal += priceByItemId.get(itemId) ?? 0;
  }
  return summaries;
}
