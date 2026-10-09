import {
  allocateItemShares,
  resolveItemSplit,
  type ItemAssignment,
  type SplitItem,
} from '../receipt-split/split-calculator';
import { resolveGroupShares, type ResolvedGroupShare } from './group-ledger';

/**
 * Line items and claims on a group expense (ABA-655). Pure, no DI, no clock unless one is passed.
 *
 * The money math is receipt-split's and is IMPORTED, never copied: `resolveItemSplit` with every
 * member who claims as a participant, **the payer included**, and the payer's final share = their
 * own claims + `ownShare` (unclaimed lines, rounding, and anything that is not a line, such as a
 * deposit). Per-line shares in basis points, per-line discounts and basket-discount scaling come
 * with it. The resolved per-member amounts are then MATERIALISED as ordinary `GroupExpenseShare`
 * rows, so the ledger, the balances, the reminders and the guest page never learn about items.
 *
 * Everything here is in the expense's ENTRY currency (the original currency of a foreign expense,
 * ABA-654). `toGroupCurrencyShares` converts the per-member results to the group currency by the
 * weights method of spec F, with the payer last as the residual, so the shares sum exactly to the
 * stored `amount`.
 */

/** Claims are open to every live member for this long after creation (and after a reopen). */
export const CLAIM_WINDOW_DAYS = 7;
export const CLAIM_WINDOW_MS = CLAIM_WINDOW_DAYS * 24 * 3600 * 1000;
export const MAX_ITEMS = 100;
export const BP_FULL = 10000;

export interface ItemRow {
  id: string;
  totalPrice: number;
  lineDiscount?: number | null;
}

export interface ClaimRow {
  itemId: string;
  memberId: string;
  /** Null = an equal slice among the line's claimants. */
  shareBp: number | null;
}

export interface MemberAmount {
  memberId: string;
  amount: number;
}

const cents = (n: number) => Math.round(n * 100);

function toSplitItems(items: ItemRow[]): SplitItem[] {
  return items.map((i) => ({
    id: i.id,
    totalPrice: i.totalPrice,
    ...(i.lineDiscount ? { lineDiscount: i.lineDiscount } : {}),
  }));
}

/**
 * Claim rows -> receipt-split assignments, one per member in first-seen order. A line's explicit
 * share goes into `itemShareBp` only when it is set, so a line nobody hand-split keeps the
 * "divide equally" meaning.
 */
export function claimsToAssignments(claims: ClaimRow[]): ItemAssignment[] {
  const byMember = new Map<string, ItemAssignment>();
  for (const c of claims) {
    let a = byMember.get(c.memberId);
    if (!a) {
      a = { participantId: c.memberId, itemIds: [] };
      byMember.set(c.memberId, a);
    }
    a.itemIds.push(c.itemId);
    if (c.shareBp !== null && c.shareBp !== undefined) {
      a.itemShareBp = { ...(a.itemShareBp ?? {}), [c.itemId]: c.shareBp };
    }
  }
  return [...byMember.values()];
}

/**
 * Per-member amounts in the entry currency: the claimants (payer excluded) in first-seen order with a
 * positive amount, then the payer LAST with their own claims + the remainder. The sum is exactly
 * `billTotal` (in cents) by construction: the remainder is a subtraction.
 */
export function resolveItemizedSplit(input: {
  items: ItemRow[];
  claims: ClaimRow[];
  billTotal: number;
  discountAmount?: number | null;
  payerMemberId: string;
}): MemberAmount[] {
  const result = resolveItemSplit(
    toSplitItems(input.items),
    claimsToAssignments(input.claims),
    input.billTotal,
    input.discountAmount ?? 0,
  );
  const out: MemberAmount[] = [];
  let payerOwnClaimsCents = 0;
  for (const s of result.shares) {
    if (s.participantId === input.payerMemberId) {
      payerOwnClaimsCents = cents(s.amount);
      continue;
    }
    if (cents(s.amount) > 0) out.push({ memberId: s.participantId, amount: s.amount });
  }
  out.push({ memberId: input.payerMemberId, amount: (payerOwnClaimsCents + cents(result.ownShare)) / 100 });
  return out;
}

/**
 * Entry-currency per-member amounts -> `GroupExpenseShare` rows in the group currency. Without a
 * conversion the amounts ARE the shares. With one (spec F) they are applied as WEIGHTS to the
 * converted amount, payer last as the residual cent. `shareValue` keeps the entry-currency figure,
 * as an exact split's raw input does.
 */
export function toGroupCurrencyShares(
  lineShares: MemberAmount[],
  groupAmount: number,
  converted: boolean,
): ResolvedGroupShare[] {
  if (!converted) {
    return lineShares.map((s) => ({ memberId: s.memberId, shareValue: s.amount, shareAmount: s.amount }));
  }
  return resolveGroupShares(
    groupAmount,
    'shares',
    lineShares.map((s) => ({ memberId: s.memberId, value: s.amount })),
  ).map((r, i) => ({ ...r, shareValue: lineShares[i].amount }));
}

export interface ItemizedExpenseFigures {
  /** Group currency. */
  amount: number;
  /** Entry currency; null = entered in the group currency. */
  originalAmount: number | null;
  discountAmount: number | null;
  paidByMemberId: string;
}

/** The share rows an itemised expense must hold for these lines and claims. */
export function computeItemizedShares(
  expense: ItemizedExpenseFigures,
  items: ItemRow[],
  claims: ClaimRow[],
): ResolvedGroupShare[] {
  const converted = expense.originalAmount !== null;
  const billTotal = converted ? (expense.originalAmount as number) : expense.amount;
  const line = resolveItemizedSplit({
    items,
    claims,
    billTotal,
    discountAmount: expense.discountAmount,
    payerMemberId: expense.paidByMemberId,
  });
  return toGroupCurrencyShares(line, expense.amount, converted);
}

/** Same rows, same amounts? Order-insensitive, compared in cents. A no-op claim change writes no ledger. */
export function sameShares(
  a: { memberId: string; shareAmount: number }[],
  b: { memberId: string; shareAmount: number }[],
): boolean {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((s) => [s.memberId, cents(s.shareAmount)]));
  return b.every((s) => m.get(s.memberId) === cents(s.shareAmount));
}

/** Members whose share differs between two share sets (either side), for the coalesced push. */
export function membersWithMovedShares(
  before: { memberId: string; shareAmount: number }[],
  after: { memberId: string; shareAmount: number }[],
): string[] {
  const b = new Map(before.map((s) => [s.memberId, cents(s.shareAmount)]));
  const a = new Map(after.map((s) => [s.memberId, cents(s.shareAmount)]));
  const ids = new Set([...b.keys(), ...a.keys()]);
  return [...ids].filter((id) => (b.get(id) ?? 0) !== (a.get(id) ?? 0));
}

// ------------------------------------------------------------------ the lock rule

export interface ClaimWindow {
  itemized: boolean;
  claimsOpenUntil: Date | string | null;
}

/** Every live member may toggle their own claims: an itemised expense whose window has not ended. */
export function isClaimsOpen(e: ClaimWindow, now: Date = new Date()): boolean {
  if (!e.itemized || !e.claimsOpenUntil) return false;
  const until = e.claimsOpenUntil instanceof Date ? e.claimsOpenUntil : new Date(e.claimsOpenUntil);
  return until.getTime() > now.getTime();
}

/**
 * The payer, the creator and the owner may change anyone's claims and shares at any time, and close
 * or reopen the window. That is exactly the authority they already have to edit the expense's shares.
 */
export function canManageClaims(
  actor: { id: string; isOwner: boolean },
  e: { paidByMemberId: string; createdByMemberId: string },
): boolean {
  return actor.isOwner || e.paidByMemberId === actor.id || e.createdByMemberId === actor.id;
}

export function claimWindowEnd(from: Date): Date {
  return new Date(from.getTime() + CLAIM_WINDOW_MS);
}

// ------------------------------------------------------------------ validation

export type LinesRejection = 'no_items' | 'too_many_items' | 'bad_price' | 'bad_line_discount' | 'bad_discount' | 'lines_exceed_total';

/**
 * Lines must be able to fit inside what was paid: (sum of net line prices - basket discount) <=
 * `billTotal`, otherwise the payer's remainder would go negative. A basket discount is 0 or strictly
 * between 0 and the net line sum (the only range in which receipt-split scales anything). A line
 * discount is at most its line. The rest of `billTotal` (a deposit, a tip) stays with the payer.
 */
export function validateItemLines(
  items: { totalPrice: number; lineDiscount?: number | null }[],
  billTotal: number,
  discountAmount?: number | null,
): LinesRejection | null {
  if (items.length === 0) return 'no_items';
  if (items.length > MAX_ITEMS) return 'too_many_items';
  let net = 0;
  for (const i of items) {
    if (!Number.isFinite(i.totalPrice) || i.totalPrice < 0) return 'bad_price';
    const d = i.lineDiscount ?? 0;
    if (!Number.isFinite(d) || d < 0 || cents(d) > cents(i.totalPrice)) return 'bad_line_discount';
    net += cents(i.totalPrice) - cents(d);
  }
  const disc = cents(discountAmount ?? 0);
  if (disc < 0 || (disc > 0 && disc >= net)) return 'bad_discount';
  if (net - disc > cents(billTotal)) return 'lines_exceed_total';
  return null;
}

export type ClaimRejection = 'bad_share' | 'line_over_full';

/**
 * Receipt-split's share rules, applied to claim rows: a share is a whole number of basis points in
 * 0..10000 and one line may not exceed 10000 across its claimants. Deliberately NOT checked: that a
 * line reaches 10000 (the rest of the line is the payer's). A share always sits on a claim row, so
 * "the claimant must hold a claim" holds by construction.
 */
export function validateClaimShares(claims: ClaimRow[]): ClaimRejection | null {
  const perLine = new Map<string, number>();
  for (const c of claims) {
    if (c.shareBp === null || c.shareBp === undefined) continue;
    if (!Number.isInteger(c.shareBp) || c.shareBp < 0 || c.shareBp > BP_FULL) return 'bad_share';
    const running = (perLine.get(c.itemId) ?? 0) + c.shareBp;
    if (running > BP_FULL) return 'line_over_full';
    perLine.set(c.itemId, running);
  }
  return null;
}

// ------------------------------------------------------------------ claim edits

/**
 * A member's own claim change. `scope` is the set of lines the change is about (on the guest page:
 * every line it rendered, through the hidden `l_` keys; in the app: every line). Inside the scope the
 * member ends up claiming exactly `checked`; outside it nothing moves. A line the member keeps keeps
 * its explicit share; a newly claimed line divides equally.
 */
export function applyOwnClaims(existing: ClaimRow[], memberId: string, scope: string[], checked: string[]): ClaimRow[] {
  const inScope = new Set(scope);
  const want = new Set(checked.filter((id) => inScope.has(id)));
  const out: ClaimRow[] = [];
  const kept = new Set<string>();
  for (const c of existing) {
    if (c.memberId !== memberId || !inScope.has(c.itemId)) {
      out.push(c);
      continue;
    }
    if (want.has(c.itemId)) {
      out.push(c);
      kept.add(c.itemId);
    }
  }
  for (const id of scope) {
    if (want.has(id) && !kept.has(id)) {
      out.push({ itemId: id, memberId, shareBp: null });
      kept.add(id);
    }
  }
  return out;
}

export interface ManagedClaimEntry {
  memberId: string;
  itemIds: string[];
  shareBp?: Record<string, number>;
}

/**
 * The payer/creator/owner sets the listed members' claims outright. A listed member claims exactly
 * `itemIds`. With `shareBp` omitted, their stored share on a line they keep survives; with it sent,
 * it is their full map (a line absent from it divides equally). Members not listed are untouched.
 * Throws `bad_share_target` when a share names a line outside that member's `itemIds`.
 */
export function applyManagedClaims(existing: ClaimRow[], entries: ManagedClaimEntry[]): ClaimRow[] {
  const listed = new Map(entries.map((e) => [e.memberId, e]));
  const stored = new Map(existing.map((c) => [`${c.memberId}|${c.itemId}`, c.shareBp]));
  const out: ClaimRow[] = existing.filter((c) => !listed.has(c.memberId));
  for (const e of entries) {
    const ids = [...new Set(e.itemIds)];
    if (e.shareBp) {
      for (const key of Object.keys(e.shareBp)) {
        if (!ids.includes(key)) throw new Error('bad_share_target');
      }
    }
    for (const itemId of ids) {
      const bp = e.shareBp
        ? (Object.prototype.hasOwnProperty.call(e.shareBp, itemId) ? e.shareBp[itemId] : null)
        : (stored.get(`${e.memberId}|${itemId}`) ?? null);
      out.push({ itemId, memberId: e.memberId, shareBp: bp });
    }
  }
  return out;
}

// ------------------------------------------------------------------ "your part" of each line

/**
 * The member's part of each line they claimed, in the entry currency, basket discount included.
 * The member's claims-only total comes from `resolveItemSplit` (for the payer: their own claims,
 * never the remainder), then `allocateItemShares` spreads it across their lines in whole cents, so
 * the lines add up to that total by construction. Lines they did not claim are absent.
 */
export function myLineParts(
  items: ItemRow[],
  claims: ClaimRow[],
  memberId: string,
  billTotal: number,
  discountAmount?: number | null,
): { parts: Map<string, number>; total: number } {
  const mine = claims.filter((c) => c.memberId === memberId);
  if (mine.length === 0) return { parts: new Map(), total: 0 };
  const result = resolveItemSplit(toSplitItems(items), claimsToAssignments(claims), billTotal, discountAmount ?? 0);
  const total = result.shares.find((s) => s.participantId === memberId)?.amount ?? 0;
  const claimants = new Map<string, number>();
  for (const c of claims) claimants.set(c.itemId, (claimants.get(c.itemId) ?? 0) + 1);
  const handSplit = new Set(claims.filter((c) => c.shareBp !== null && c.shareBp !== undefined).map((c) => c.itemId));
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = mine
    .filter((c) => byId.has(c.itemId))
    .map((c) => {
      const item = byId.get(c.itemId) as ItemRow;
      return {
        id: c.itemId,
        totalPrice: item.totalPrice,
        ...(item.lineDiscount ? { lineDiscount: item.lineDiscount } : {}),
        claimantCount: claimants.get(c.itemId) ?? 1,
        // A hand-split line: the member's explicit share, or 0 when they have none on it.
        ...(handSplit.has(c.itemId) ? { shareBp: c.shareBp ?? 0 } : {}),
      };
    });
  const parts = new Map<string, number>();
  for (const l of allocateItemShares(lines, total)) parts.set(l.id, l.amount);
  return { parts, total };
}
