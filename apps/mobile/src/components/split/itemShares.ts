/**
 * Explicit per-line split shares (ABA-550) — the arithmetic behind "Эдик 60%,
 * я 40%" on one receipt line.
 *
 * Nothing in this repo renders a component in CI, so every number that could be
 * wrong lives here, pure and unit-tested, and `AssignmentEditor` only lays it
 * out. Mirrors `itemAssignments.ts`, which owns who claimed what.
 *
 * Shares are held in BASIS POINTS (1/100th of a percent, 6000 = 60%) because
 * that is what the API stores: percentages lose too much to rounding on a
 * three-way split, and storing money would go stale the moment a line's price
 * is corrected.
 *
 * A line's shares deliberately need NOT add up to 10000. Whatever is left is
 * the PAYER's — the same convention the server uses, and the reason the payer
 * never has to exist as a participant row.
 */

/** itemId -> participantId -> basis points. */
export type ItemShares = Record<string, Record<string, number>>;

export const BP_FULL = 10000;

function clampBp(bp: number): number {
  if (!Number.isFinite(bp)) return 0;
  return Math.min(BP_FULL, Math.max(0, Math.round(bp)));
}

/** Everything already handed out on this line, across participants. */
export function allocatedBp(shares: ItemShares, itemId: string): number {
  const line = shares[itemId];
  if (!line) return 0;
  return Object.values(line).reduce((sum, bp) => sum + clampBp(bp), 0);
}

/** The payer's own remaining share of the line. Never negative: an
 * over-allocated line is a validation error, not a negative payer share. */
export function payerBp(shares: ItemShares, itemId: string): number {
  return Math.max(0, BP_FULL - allocatedBp(shares, itemId));
}

/** True once this line has been split by hand and stops dividing equally. */
export function hasExplicitShares(shares: ItemShares, itemId: string): boolean {
  return Object.keys(shares[itemId] ?? {}).length > 0;
}

export function isLineOverAllocated(shares: ItemShares, itemId: string): boolean {
  return allocatedBp(shares, itemId) > BP_FULL;
}

/** Set one person's share of one line. Writing 0 keeps the entry — "explicitly
 * nothing" is a real answer and must not silently revert the line to an equal
 * division, which is what deleting the last entry would do. */
export function setShare(
  shares: ItemShares,
  itemId: string,
  participantId: string,
  bp: number,
): ItemShares {
  return { ...shares, [itemId]: { ...(shares[itemId] ?? {}), [participantId]: clampBp(bp) } };
}

/** Drop every hand-set share on a line, returning it to an equal division. */
export function clearShares(shares: ItemShares, itemId: string): ItemShares {
  if (!(itemId in shares)) return shares;
  const next = { ...shares };
  delete next[itemId];
  return next;
}

/** Drop one person from one line — used when they are un-tapped as a claimant,
 * so a stale share cannot keep charging someone who no longer claims it. */
export function removeShare(
  shares: ItemShares,
  itemId: string,
  participantId: string,
): ItemShares {
  const line = shares[itemId];
  if (!line || !(participantId in line)) return shares;
  const nextLine = { ...line };
  delete nextLine[participantId];
  if (Object.keys(nextLine).length === 0) return clearShares(shares, itemId);
  return { ...shares, [itemId]: nextLine };
}

/** Drop a participant from every line — used when they are deleted outright. */
export function removeParticipantFromShares(
  shares: ItemShares,
  participantId: string,
): ItemShares {
  let next = shares;
  for (const itemId of Object.keys(shares)) {
    next = removeShare(next, itemId, participantId);
  }
  return next;
}

/** The equal share each of `claimantCount` claimants gets, in basis points.
 * Floors, so N claimants never add up to more than 10000 — any lost basis
 * points land with the payer, which is the safe direction. */
export function equalBp(claimantCount: number): number {
  if (!Number.isFinite(claimantCount) || claimantCount < 1) return 0;
  return Math.floor(BP_FULL / Math.floor(claimantCount));
}

/** What a line's shares ACTUALLY are right now, for display: the hand-set ones
 * once it has been touched, otherwise the equal division it is still using.
 *
 * The payer's remainder has to be derived from THIS, never from the stored map:
 * an untouched line stores nothing, so reading the map directly reports the
 * payer as taking the whole line while the claimant rows above it already show
 * an equal split — a screen that adds up to 200%.
 */
export function effectiveLineShares(
  shares: ItemShares,
  itemId: string,
  claimantIds: string[],
): Record<string, number> {
  if (hasExplicitShares(shares, itemId)) {
    const stored = shares[itemId] ?? {};
    const out: Record<string, number> = {};
    for (const id of claimantIds) out[id] = clampBp(stored[id] ?? 0);
    return out;
  }
  const each = equalBp(claimantIds.length);
  const out: Record<string, number> = {};
  for (const id of claimantIds) out[id] = each;
  return out;
}

/** The payer's share of a line given what is actually displayed on it. */
export function payerBpFrom(effective: Record<string, number>): number {
  const allocated = Object.values(effective).reduce((sum, bp) => sum + clampBp(bp), 0);
  return Math.max(0, BP_FULL - allocated);
}

/** Seed a line with the equal split it already had, so opening the editor shows
 * today's numbers and the user edits from there rather than from zero. */
export function seedEqualShares(
  shares: ItemShares,
  itemId: string,
  participantIds: string[],
  includePayer = false,
): ItemShares {
  if (participantIds.length === 0) return shares;
  // Counting the payer is the whole of "I had some of this too": each friend
  // simply gets a smaller equal slice, and what is left over is the payer's by
  // the same remainder rule the server already uses. No payer row is stored,
  // and nothing about the wire format changes.
  const each = equalBp(participantIds.length + (includePayer ? 1 : 0));
  const line: Record<string, number> = {};
  for (const id of participantIds) line[id] = each;
  return { ...shares, [itemId]: line };
}

/** Money typed by the user -> basis points. A zero or unknown line price cannot
 * be turned into a fraction, so it reads as nothing rather than as everything. */
export function bpFromAmount(amount: number, linePrice: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(linePrice) || linePrice <= 0) return 0;
  return clampBp((amount / linePrice) * BP_FULL);
}

/** Basis points -> money, for display beside the input. Rounded to cents. */
export function amountFromBp(bp: number, linePrice: number): number {
  if (!Number.isFinite(linePrice)) return 0;
  return Math.round((clampBp(bp) / BP_FULL) * linePrice * 100) / 100;
}

/** Whether the payer is currently taking a part of this line: true exactly when
 * the line has been split by hand and the friends on it do not take all of it.
 * Derived rather than stored — "the payer has 40% of this line" and "the shares
 * add up to 60%" are the same statement, so a second flag could only ever
 * disagree with the numbers. */
export function payerClaimsLine(
  shares: ItemShares,
  itemId: string,
  claimantIds: string[],
): boolean {
  if (!hasExplicitShares(shares, itemId)) return false;
  return payerBpFrom(effectiveLineShares(shares, itemId, claimantIds)) > 0;
}

/** The `itemShareBp` map to send for one participant: only the lines they were
 * actually given a hand-set share of. An empty result must be sent as undefined
 * by the caller, so a split with no manual shares keeps the old wire shape. */
export function sharesForParticipant(
  shares: ItemShares,
  participantId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [itemId, line] of Object.entries(shares)) {
    if (participantId in line) out[itemId] = clampBp(line[participantId]);
  }
  return out;
}

/** Every line whose hand-set shares add up to more than the whole line. The
 * server rejects these, so the screen blocks submit and names them first. */
export function overAllocatedItemIds(shares: ItemShares): string[] {
  return Object.keys(shares).filter((itemId) => isLineOverAllocated(shares, itemId));
}
