/**
 * The budget mirror's pure half (ABA-660, phase-2 spec section H): which share rows a mirroring
 * member should have, and which of their captured payments match which group cash leg. No DI, no
 * Prisma; `GroupBudgetMirrorService` loads the rows and applies the plans.
 *
 * The accounting it serves is the CONSUMPTION model: a member who turns the mirror on gets one
 * ordinary personal expense per group expense for their own share, and every group cash movement of
 * theirs that is linked (my card payment for an expense I paid, my settlement transfer out, a
 * settlement transfer I received) is excluded through `isSplitReceivable`, so nothing counts twice.
 */
import type { GroupCashLegKind } from '@budget/shared-types';

/** An exact match may be this many whole days away from the leg (a card posts a day or two late). */
export const MIRROR_EXACT_DAYS = 3;
/** A suggestion may be this far away... */
export const MIRROR_SUGGEST_DAYS = 7;
/** ...and differ by up to this share of the leg's amount (a tip, a fee, a rounded transfer). */
export const MIRROR_SUGGEST_AMOUNT_RATIO = 0.1;
/** At most this many suggestions per leg, the closest first. */
export const MAX_SUGGESTIONS_PER_LEG = 5;

const DAY_MS = 86_400_000;
const cents = (n: number) => Math.round(n * 100);

/** The first day of `now`'s UTC month: what is mirrored when the mirror is turned on (no history dump). */
export function mirrorStartFor(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Whole UTC calendar days between two dates (a date-only column reads as UTC midnight). */
export function dayDistance(a: Date, b: Date): number {
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.abs(Math.round((da - db) / DAY_MS));
}

export const legKeyOf = (kind: GroupCashLegKind, refId: string) => `${kind}:${refId}`;
/** A settlement received is an Income; everything else I paid is an Expense. */
export const legSide = (kind: GroupCashLegKind): 'expense' | 'income' => (kind === 'settlement_in' ? 'income' : 'expense');
export const candidateKeyOf = (side: 'expense' | 'income', id: string) => `${side === 'expense' ? 'e' : 'i'}:${id}`;
export const pairKeyOf = (legKey: string, candidateKey: string) => `${legKey}|${candidateKey}`;

// ------------------------------------------------------------------ share rows

export interface DesiredShare {
  groupExpenseId: string;
  /** My share in the group currency. */
  share: number;
  date: Date;
}

export interface ExistingShareRow {
  id: string;
  groupExpenseId: string;
  isDeleted: boolean;
  date: Date;
  /** The share this row was last written from (group currency); null on a row written before the column. */
  groupShareAmount: number | null;
}

export interface ShareRowPlan {
  create: DesiredShare[];
  /** Rows whose share moved (re-price) and/or whose date moved. */
  update: Array<{ id: string; desired: DesiredShare; reprice: boolean }>;
  /** Live rows to soft-delete AND detach: the group expense is gone, my share is 0, or it left the window. */
  remove: string[];
  /** Rows the user deleted whose group expense is gone: detached only (they are already deleted). */
  detach: string[];
}

/**
 * Idempotent: running it on its own output plans nothing. A row the user deleted (still attached) is
 * respected as "don't count this one" and never recreated or touched while its group expense lives.
 */
export function planShareRows(desired: DesiredShare[], existing: ExistingShareRow[]): ShareRowPlan {
  const want = new Map(desired.filter((d) => cents(d.share) > 0).map((d) => [d.groupExpenseId, d]));
  const plan: ShareRowPlan = { create: [], update: [], remove: [], detach: [] };
  const seen = new Set<string>();
  for (const row of existing) {
    seen.add(row.groupExpenseId);
    const d = want.get(row.groupExpenseId);
    if (!d) {
      if (row.isDeleted) plan.detach.push(row.id);
      else plan.remove.push(row.id);
      continue;
    }
    if (row.isDeleted) continue;
    const reprice = row.groupShareAmount == null || cents(row.groupShareAmount) !== cents(d.share);
    const redate = dayDistance(row.date, d.date) !== 0;
    if (reprice || redate) plan.update.push({ id: row.id, desired: d, reprice });
  }
  for (const d of want.values()) if (!seen.has(d.groupExpenseId)) plan.create.push(d);
  return plan;
}

// ------------------------------------------------------------------ cash legs

export interface CashLeg {
  key: string;
  kind: GroupCashLegKind;
  /** groupExpenseId for `payer_expense`, settlementId otherwise. */
  refId: string;
  amount: number;
  currencyCode: string;
  date: Date;
  /**
   * ABA-660 review H1: the mirroring member themself created the group expense / recorded the
   * settlement. A leg someone else wrote can only ever be a suggestion, never an automatic link, or
   * another member could hide one of my real expenses by typing one that matches it.
   */
  authoredByMe: boolean;
  /** Display name of whoever created the expense / recorded the settlement (null when unknown). */
  addedByName?: string | null;
}

export interface CashCandidate {
  key: string;
  side: 'expense' | 'income';
  id: string;
  amount: number;
  currencyCode: string;
  date: Date;
}

export const isExactMatch = (leg: CashLeg, c: CashCandidate) =>
  legSide(leg.kind) === c.side &&
  leg.currencyCode === c.currencyCode &&
  cents(leg.amount) === cents(c.amount) &&
  dayDistance(leg.date, c.date) <= MIRROR_EXACT_DAYS;

export const isNearMatch = (leg: CashLeg, c: CashCandidate) =>
  legSide(leg.kind) === c.side &&
  leg.currencyCode === c.currencyCode &&
  Math.abs(cents(leg.amount) - cents(c.amount)) <= Math.round(cents(leg.amount) * MIRROR_SUGGEST_AMOUNT_RATIO) &&
  dayDistance(leg.date, c.date) <= MIRROR_SUGGEST_DAYS;

export interface CashLinkPlan {
  auto: Array<{ leg: CashLeg; candidate: CashCandidate }>;
  suggestions: Array<{ leg: CashLeg; candidate: CashCandidate }>;
}

/**
 * The two tiers (the bank-notification precedent). Tier 1, automatic: a leg the member authored themself (ABA-660 review H1) with exactly ONE exact
 * candidate (same side, currency and amount, within 3 days) that is itself the exact candidate of no
 * other unlinked leg. Two 50.00 transfers on one day are therefore never guessed at. Tier 2, a
 * suggestion: every other exact or near candidate (same currency, within 10% and 7 days), at most 5
 * per leg, closest first. A pair the user rejected (or unlinked) is never planned again.
 *
 * `legs` and `candidates` must already be the UNLINKED ones.
 */
export function planCashLinks(legs: CashLeg[], candidates: CashCandidate[], rejected: ReadonlySet<string>): CashLinkPlan {
  const allowed = (leg: CashLeg, c: CashCandidate) => !rejected.has(pairKeyOf(leg.key, c.key));
  const exactOf = new Map<string, CashCandidate[]>();
  const exactLegsOf = new Map<string, number>();
  for (const leg of legs) {
    const hits = candidates.filter((c) => allowed(leg, c) && isExactMatch(leg, c));
    exactOf.set(leg.key, hits);
    for (const c of hits) exactLegsOf.set(c.key, (exactLegsOf.get(c.key) ?? 0) + 1);
  }
  const plan: CashLinkPlan = { auto: [], suggestions: [] };
  const taken = new Set<string>();
  for (const leg of legs) {
    const hits = exactOf.get(leg.key) ?? [];
    // Exclusivity still counts a leg someone else wrote: it makes the candidate ambiguous.
    if (leg.authoredByMe && hits.length === 1 && exactLegsOf.get(hits[0].key) === 1) {
      plan.auto.push({ leg, candidate: hits[0] });
      taken.add(hits[0].key);
    }
  }
  const autoLegs = new Set(plan.auto.map((a) => a.leg.key));
  for (const leg of legs) {
    if (autoLegs.has(leg.key)) continue;
    const near = candidates
      .filter((c) => !taken.has(c.key) && allowed(leg, c) && (isExactMatch(leg, c) || isNearMatch(leg, c)))
      .sort(
        (a, b) =>
          Math.abs(cents(a.amount) - cents(leg.amount)) - Math.abs(cents(b.amount) - cents(leg.amount)) ||
          dayDistance(a.date, leg.date) - dayDistance(b.date, leg.date) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, MAX_SUGGESTIONS_PER_LEG);
    for (const c of near) plan.suggestions.push({ leg, candidate: c });
  }
  return plan;
}

// ------------------------------------------------------------------ accounting check

/**
 * What a mirroring member's books count for a group, for the accounting test: every live share row
 * plus every personal cash row that is NOT flagged. Consumption is the member's share sum, so with
 * every leg linked the two are equal and nothing is counted twice.
 */
export function countedOutflow(rows: Array<{ amount: number; isSplitReceivable: boolean; isDeleted?: boolean }>): number {
  return cents(rows.filter((r) => !r.isDeleted && !r.isSplitReceivable).reduce((s, r) => s + r.amount, 0)) / 100;
}
