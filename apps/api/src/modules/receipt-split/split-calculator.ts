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

/** One line the participant claimed, plus how many people claimed it. */
export interface ClaimedLine {
  id: string;
  totalPrice: number;
  /** Total claimants of this line INCLUDING the participant being rendered.
   *  Anything below 1 is read as 1 — a line a participant claimed always has
   *  at least one claimant. */
  claimantCount: number;
}

export interface LineShare {
  id: string;
  /** This participant's share of the line, in currency units. */
  amount: number;
  /** Echo of `claimantCount` after normalization; 1 means "not shared". */
  sharedWith: number;
}

/**
 * Splits a participant's OWN total across the lines they claimed, so the guest
 * page can show what each line costs *them* rather than what it cost outright.
 *
 * Rendering `item.totalPrice` per line is only correct while nobody shares a
 * line: a 60 bottle claimed by three people is 20 to each of them, and a page
 * that prints "60" above a total of "20" is the reason this function exists.
 *
 * `totalAmount` is the participant's STORED amount (what `resolveItemSplit`
 * computed at creation and what the page prints as their total) — it is not
 * recomputed here. That is deliberate: recomputing means re-summing
 * `price / claimants` in floating point, and the result depends on the order
 * the lines happen to arrive in, so the lines could disagree with the total by
 * a cent purely from addition order. Allocating against the stored number
 * makes the invariant "lines add up to the total" true by construction.
 *
 * Each line is floored to the cent and the leftover cents are handed out by
 * largest fractional remainder (ties by line order, so the output is
 * deterministic). Flooring n lines can only ever lose less than n cents, so a
 * leftover of n or more is not rounding — it means the participant was charged
 * for something these lines do not account for, the reachable case being a
 * claimed line soft-deleted after the split was created. Padding the survivors
 * then would overstate what each surviving thing cost, so nothing is
 * distributed at all and the lines honestly add up to less than the total.
 */
export function allocateItemShares(lines: ClaimedLine[], totalAmount: number): LineShare[] {
  const exact = lines.map((line) => {
    const sharedWith = line.claimantCount >= 1 ? Math.floor(line.claimantCount) : 1;
    // Integer cents, rounded once up front — see the module docstring.
    return { id: line.id, sharedWith, cents: Math.round(line.totalPrice * 100) / sharedWith };
  });

  const allocated = exact.map((entry) => Math.floor(entry.cents));
  const flooredSum = allocated.reduce((sum, cents) => sum + cents, 0);
  const rawLeftover = Math.round(totalAmount * 100) - flooredSum;
  let leftover = rawLeftover < exact.length ? rawLeftover : 0;

  const byRemainder = exact
    .map((entry, index) => ({ index, remainder: entry.cents - Math.floor(entry.cents) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    allocated[index] += 1;
    leftover -= 1;
  }

  return exact.map((entry, index) => ({
    id: entry.id,
    amount: allocated[index] / 100,
    sharedWith: entry.sharedWith,
  }));
}
