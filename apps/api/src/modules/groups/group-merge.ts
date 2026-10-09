import { BP_FULL } from './group-items';

/**
 * Merging two members of a group (ABA-657, phase-2 spec section D). Pure, no DI, no clock.
 *
 * The merge re-points every ledger row of the ABSORBED member (`from`) to the SURVIVING one (`into`)
 * and must leave the pair's combined balance and every other member's balance exactly where they
 * were. This module decides who survives and who may ask (`normaliseMergePair`, `mergeConsent`),
 * plans the row changes that are more than a plain re-point (`planMemberMerge`), and checks the
 * result (`checkMergeBalances`), which `GroupMergeService` runs INSIDE its transaction.
 *
 * Why the plan sums share rows instead of re-deriving an itemised expense's shares from its claims:
 * a balance is a function of `paidBy` and the share amounts only, so summing the two rows keeps every
 * balance to the cent by construction. Re-deriving would floor each claimant again and could move a
 * cent to or from a third member (the payer), which the invariant check would then have to refuse.
 * The claims are still rewritten so that the NEXT re-derivation (the next claim change) reproduces
 * the same division, within the basis-point rounding of an equal line split three or more ways.
 */

export interface MergeMember {
  id: string;
  userId: string | null;
  claimTokenHash: string | null;
}

export type MergeRefusal = 'same_member' | 'both_app_users';

/**
 * Who survives. Never two app-user rows (each is someone's account). When an app-user row would be
 * absorbed by a guest row, the two are swapped so the app user's row survives: the account is the
 * identity that has to keep working.
 */
export function normaliseMergePair(
  a: MergeMember,
  b: MergeMember,
): { ok: true; from: MergeMember; into: MergeMember } | { ok: false; reason: MergeRefusal } {
  if (a.id === b.id) return { ok: false, reason: 'same_member' };
  if (a.userId && b.userId) return { ok: false, reason: 'both_app_users' };
  if (a.userId && !b.userId) return { ok: true, from: b, into: a };
  return { ok: true, from: a, into: b };
}

/**
 * The consent rule (spec D, threat 3): a merge moves money between identities, so whoever ends up
 * holding the merged balance must be the one asking.
 * - The owner may merge into an UNCLAIMED guest row or into their OWN row ("Ania" and "Ania (2)").
 * - Any member may absorb an UNCLAIMED guest row into their own row: no more power than claiming
 *   that placeholder at join time, which anyone with the link has.
 * - Merging into another app user's row is never allowed here: only that person can consent, and
 *   they do it themselves (absorb, or the link-code self-merge).
 * `from` is always a guest row after `normaliseMergePair`.
 */
export function mergeConsent(
  actor: { id: string; isOwner: boolean },
  from: MergeMember,
  into: MergeMember,
): boolean {
  if (from.userId) return false;
  // ABA-657 review M2: an owner may fold a guest into another guest row only while that row is
  // unclaimed. A claimed one is a particular person's browser identity; the owner cannot hand them a
  // stranger's balance.
  if (actor.isOwner && ((!into.userId && into.claimTokenHash === null) || into.id === actor.id)) return true;
  return into.id === actor.id && from.claimTokenHash === null;
}

// ------------------------------------------------------------------ the plan

export type MergeSplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface MergeShare {
  id: string;
  memberId: string;
  shareValue: number | null;
  shareAmount: number;
}

export interface MergeExpense {
  id: string;
  splitType: MergeSplitType;
  shares: MergeShare[];
}

export interface MergeClaim {
  id: string;
  itemId: string;
  memberId: string;
  shareBp: number | null;
}

export interface MergeSettlement {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  voidedAt: Date | string | null;
}

export interface MemberMergePlan {
  /** Share rows whose `memberId` simply moves to `into` (into had no share on that expense). */
  shareRepoints: string[];
  /** Expenses on which both had a share: `into`'s row takes the sum, `from`'s row is deleted. */
  shareCombines: { expenseId: string; keepId: string; deleteId: string; shareAmount: number; shareValue: number | null }[];
  /**
   * An EQUAL split on which both had a share becomes a `shares` split (`into` 2 units, everyone else
   * 1), so a later edit that re-resolves the stored shares keeps `into`'s double part instead of
   * quietly dividing the amount n-1 ways.
   */
  splitTypeChanges: { expenseId: string; splitType: 'shares'; values: { shareId: string; value: number }[] }[];
  /** Claim rows whose `memberId` simply moves to `into`. */
  claimRepoints: string[];
  /** Claim rows whose `shareBp` changes (into's combined claim, or co-claimants converted to explicit bp). */
  claimUpdates: { id: string; shareBp: number | null }[];
  /** `from`'s claims on a line `into` also claims. */
  claimDeletes: string[];
  /** Live settlements between the pair: they become `into -> into`, so they are voided. */
  settlementVoids: string[];
}

/**
 * Splits BP_FULL into integer parts proportional to `weights` (largest remainder, ties to the
 * earlier entry), so the parts always add up to exactly BP_FULL.
 */
export function apportionBp(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (BP_FULL * w) / total);
  const out = raw.map((r) => Math.floor(r));
  let left = BP_FULL - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    out[o.i] += 1;
    left -= 1;
  }
  return out;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * What changes beyond a plain re-point. Expense payer/creator/deleter and settlement
 * recorder/voider columns are re-pointed wholesale by the caller; this covers the rows a unique key
 * or a fraction makes special.
 *
 * `removedMemberIds`: members whose claims count as unclaimed (`GroupItemsService.dropRemovedClaims`)
 * and are therefore left out of a line's claimant count.
 */
export function planMemberMerge(input: {
  fromId: string;
  intoId: string;
  expenses: MergeExpense[];
  claims: MergeClaim[];
  settlements: MergeSettlement[];
  removedMemberIds?: Iterable<string>;
}): MemberMergePlan {
  const { fromId, intoId } = input;
  const removed = new Set(input.removedMemberIds ?? []);
  const plan: MemberMergePlan = {
    shareRepoints: [],
    shareCombines: [],
    splitTypeChanges: [],
    claimRepoints: [],
    claimUpdates: [],
    claimDeletes: [],
    settlementVoids: [],
  };

  for (const e of input.expenses) {
    const f = e.shares.find((s) => s.memberId === fromId);
    if (!f) continue;
    const i = e.shares.find((s) => s.memberId === intoId);
    if (!i) {
      plan.shareRepoints.push(f.id);
      continue;
    }
    const shareAmount = (cents(f.shareAmount) + cents(i.shareAmount)) / 100;
    if (e.splitType === 'equal') {
      plan.shareCombines.push({ expenseId: e.id, keepId: i.id, deleteId: f.id, shareAmount, shareValue: 2 });
      plan.splitTypeChanges.push({
        expenseId: e.id,
        splitType: 'shares',
        values: e.shares.filter((s) => s.id !== f.id && s.id !== i.id).map((s) => ({ shareId: s.id, value: 1 })),
      });
    } else {
      const shareValue =
        f.shareValue === null && i.shareValue === null ? null : round4((f.shareValue ?? 0) + (i.shareValue ?? 0));
      plan.shareCombines.push({ expenseId: e.id, keepId: i.id, deleteId: f.id, shareAmount, shareValue });
    }
  }

  const byItem = new Map<string, MergeClaim[]>();
  for (const c of input.claims) {
    if (removed.has(c.memberId) && c.memberId !== fromId && c.memberId !== intoId) continue;
    const list = byItem.get(c.itemId) ?? [];
    list.push(c);
    byItem.set(c.itemId, list);
  }
  for (const [, list] of byItem) {
    const f = list.find((c) => c.memberId === fromId);
    if (!f) continue;
    const i = list.find((c) => c.memberId === intoId);
    if (!i) {
      plan.claimRepoints.push(f.id);
      continue;
    }
    plan.claimDeletes.push(f.id);
    const handSplit = list.some((c) => c.shareBp !== null && c.shareBp !== undefined);
    if (handSplit) {
      // On a hand-split line a claimant without bp takes nothing, so null reads as 0.
      plan.claimUpdates.push({ id: i.id, shareBp: Math.min(BP_FULL, (f.shareBp ?? 0) + (i.shareBp ?? 0)) });
      continue;
    }
    if (list.length === 2) continue; // the pair held the whole line between them; into keeps it whole
    // An equal line divided n ways: into now holds two slices and everyone else one. That cannot be
    // said with equal division over n-1 claimants, so the line becomes explicit bp at its current
    // fractions (otherwise a third claimant's slice would grow from 1/n to 1/(n-1)).
    const rest = list.filter((c) => c.id !== f.id && c.id !== i.id);
    const bp = apportionBp([2, ...rest.map(() => 1)]);
    plan.claimUpdates.push({ id: i.id, shareBp: bp[0] });
    rest.forEach((c, k) => plan.claimUpdates.push({ id: c.id, shareBp: bp[k + 1] }));
  }

  for (const s of input.settlements) {
    if (s.voidedAt) continue;
    const pair =
      (s.fromMemberId === fromId && s.toMemberId === intoId) || (s.fromMemberId === intoId && s.toMemberId === fromId);
    if (pair) plan.settlementVoids.push(s.id);
  }
  return plan;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ------------------------------------------------------------------ the invariant

/** Below half a cent a difference is float noise, never money. */
export const MERGE_BALANCE_EPSILON = 0.005;

/**
 * The merge invariant, checked inside the transaction against balances re-read AFTER the writes:
 * `into` now holds exactly what the pair held together, `from` holds nothing, and every other
 * member (removed strays included) is unchanged. Returns the ids that broke it; empty = holds.
 */
export function checkMergeBalances(
  before: Map<string, number>,
  after: Map<string, number>,
  fromId: string,
  intoId: string,
): string[] {
  const bad: string[] = [];
  const get = (m: Map<string, number>, id: string) => m.get(id) ?? 0;
  const pair = get(before, fromId) + get(before, intoId);
  if (Math.abs(get(after, intoId) - pair) >= MERGE_BALANCE_EPSILON) bad.push(intoId);
  if (Math.abs(get(after, fromId)) >= MERGE_BALANCE_EPSILON) bad.push(fromId);
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of ids) {
    if (id === fromId || id === intoId) continue;
    if (Math.abs(get(after, id) - get(before, id)) >= MERGE_BALANCE_EPSILON) bad.push(id);
  }
  return bad;
}
