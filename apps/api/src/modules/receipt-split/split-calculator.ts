/**
 * Pure arithmetic for splitting a bill among diners. No IO, no clock, no
 * injected services — deterministic given its inputs.
 *
 * The rounding remainder always goes to the payer, never a participant:
 * each participant's share is rounded DOWN to the cent, and the payer's
 * share is computed as `billTotal - sum(participant shares)`. That
 * subtraction (not "last entry gets the leftover") is what makes the
 * remainder land on the payer regardless of argument order.
 *
 * All arithmetic below is done in integer cents. Money inputs (item
 * prices, bill totals) are meant to be exact cent values, but
 * `price * 100` can land a hair below the intended integer purely from
 * binary floating-point representation (e.g. `19.99 * 100 === 1998.9999999999998`).
 * Converting with `Math.round` once, up front, snaps each input back to
 * the integer cents it actually represents; only the division of an
 * item's price among its claimants is allowed to be fractional, and only
 * `Math.floor` — never `Math.round` — is applied to that fractional
 * result, which is what keeps the rounding remainder with the payer.
 */

export interface SplitItem {
  id: string;
  totalPrice: number;
}

export interface ItemAssignment {
  participantId: string;
  itemIds: string[];
}

export interface ParticipantShare {
  participantId: string;
  amount: number;
}

export interface SplitResult {
  shares: ParticipantShare[];
  ownShare: number;
}

/**
 * Splits a scanned receipt's line items among the participants who claimed
 * them. An item claimed by N participants is divided equally among them;
 * an item nobody claimed stays with the payer. Each participant's total is
 * rounded down to the cent; the payer absorbs whatever is left over
 * (unclaimed items plus every participant's rounding remainder).
 *
 * `ownShare` can be negative when the assignments' items add up to more
 * than `billTotal` — this function does not validate that relationship
 * (that lives in the service layer), so callers should not assume the
 * result is always non-negative.
 */
export function resolveItemSplit(
  items: SplitItem[],
  assignments: ItemAssignment[],
  billTotal: number,
): SplitResult {
  const claimantCountByItem = new Map<string, number>();
  for (const assignment of assignments) {
    for (const itemId of assignment.itemIds) {
      claimantCountByItem.set(itemId, (claimantCountByItem.get(itemId) ?? 0) + 1);
    }
  }

  // Integer cents, rounded once up front — see the module docstring.
  const priceCentsById = new Map(items.map((item) => [item.id, Math.round(item.totalPrice * 100)]));

  const participantCentsTotals = new Map<string, number>();
  for (const assignment of assignments) {
    // Ensure every participant appears in the output even if every item id
    // they claimed turns out to be unknown (share of 0), and even if this
    // is not their first assignment entry (accumulate, don't overwrite).
    if (!participantCentsTotals.has(assignment.participantId)) {
      participantCentsTotals.set(assignment.participantId, 0);
    }
    for (const itemId of assignment.itemIds) {
      const priceCents = priceCentsById.get(itemId);
      if (priceCents === undefined) continue; // unknown item id: no charge, no payer credit
      const claimants = claimantCountByItem.get(itemId) ?? 1;
      const current = participantCentsTotals.get(assignment.participantId) ?? 0;
      participantCentsTotals.set(assignment.participantId, current + priceCents / claimants);
    }
  }

  // Build `shares` from the deduplicated participant map, not by re-walking
  // `assignments` — a participant can legally appear in more than one
  // assignment entry, and re-walking would emit one row per occurrence,
  // each carrying the participant's already-summed (full) total.
  const shares: ParticipantShare[] = [];
  let participantCentsSum = 0;
  for (const [participantId, cents] of participantCentsTotals) {
    const flooredCents = Math.floor(cents);
    shares.push({ participantId, amount: flooredCents / 100 });
    participantCentsSum += flooredCents;
  }

  const billTotalCents = Math.round(billTotal * 100);
  const ownShare = (billTotalCents - participantCentsSum) / 100;

  return { shares, ownShare };
}

/**
 * Splits a bill with no line items evenly among the participants PLUS the
 * payer (the payer is one of the diners, not an extra head). Each
 * participant's share is rounded down to the cent; the payer's share is
 * `billTotal - sum(participant shares)`, so the payer structurally absorbs
 * the remainder regardless of how many participants there are or the
 * order they were passed in.
 *
 * `ownShare` can be negative in principle if `billTotal` is negative or
 * otherwise inconsistent with `participantIds` — this function does not
 * validate its inputs (that lives in the service layer), so callers
 * should not assume the result is always non-negative.
 */
export function resolveEqualSplit(participantIds: string[], billTotal: number): SplitResult {
  const headCount = participantIds.length + 1; // + the payer

  // Integer cents, rounded once up front — see the module docstring.
  const billTotalCents = Math.round(billTotal * 100);
  const perHeadCents = Math.floor(billTotalCents / headCount);

  const shares: ParticipantShare[] = participantIds.map((participantId) => ({
    participantId,
    amount: perHeadCents / 100,
  }));

  const participantCentsSum = perHeadCents * participantIds.length;
  const ownShare = (billTotalCents - participantCentsSum) / 100;

  return { shares, ownShare };
}
