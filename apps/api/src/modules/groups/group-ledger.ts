import { resolveShares, type ShareType } from '../expenses/trip-share-calculator';
import {
  computeBalances,
  simplifyDebts,
  round2,
  type Balance,
  type ShareInput,
} from '../trip-settle-up/settle-up-calculator';

/**
 * Pure group-ledger math (ABA-640). No DI, no I/O. A member id is passed to the trip calculators as
 * their opaque `userId`; groups never write an Expense row.
 */

export interface LedgerMember {
  id: string;
}

export interface LedgerExpense {
  id: string;
  paidByMemberId: string;
  amount: number;
  deletedAt?: Date | string | null;
  shares: { memberId: string; shareAmount: number }[];
}

export interface LedgerSettlement {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  voidedAt?: Date | string | null;
}

export interface LedgerBalance {
  memberId: string;
  netAmount: number;
}

export interface LedgerTransfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export interface GroupLedger {
  balances: LedgerBalance[];
  suggestedTransfers: LedgerTransfer[];
}

export interface RawGroupShare {
  memberId: string;
  value?: number;
}

export interface ResolvedGroupShare {
  memberId: string;
  /** Raw input (exact / percent / units); null for an equal split. */
  shareValue: number | null;
  shareAmount: number;
}

export const SETTLE_TOLERANCE = 0.01;

/**
 * Resolves a group expense's shares. Throws (a plain Error from resolveShares, which the service maps
 * to 400) when exact shares do not sum to the amount or the share units are zero.
 */
export function resolveGroupShares(
  amount: number,
  splitType: ShareType,
  raw: RawGroupShare[],
): ResolvedGroupShare[] {
  const resolved = resolveShares(
    amount,
    splitType,
    raw.map((s) => ({ userId: s.memberId, value: s.value ?? 0 })),
  );
  return resolved.map((r, i) => ({
    memberId: r.userId,
    shareValue: splitType === 'equal' ? null : (raw[i].value ?? null),
    shareAmount: r.shareAmount,
  }));
}

/**
 * Net balance per live member (positive = is owed) and the suggested transfers. Deleted expenses and
 * voided settlements are excluded; every non-voided settlement is a synthetic entry in which the
 * debtor "paid" and the creditor "consumed" the same amount.
 */
export function computeGroupLedger(
  members: LedgerMember[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
): GroupLedger {
  const entries: ShareInput[] = [];
  for (const e of expenses) {
    if (e.deletedAt) continue;
    entries.push({
      expenseId: e.id,
      paidByUserId: e.paidByMemberId,
      amountInAccountCurrency: e.amount,
      shares: e.shares.map((s) => ({ userId: s.memberId, shareAmount: s.shareAmount })),
    });
  }
  for (const s of settlements) {
    if (s.voidedAt) continue;
    entries.push({
      expenseId: `settlement:${s.id}`,
      paidByUserId: s.fromMemberId,
      amountInAccountCurrency: s.amount,
      shares: [{ userId: s.toMemberId, shareAmount: s.amount }],
    });
  }

  const net = new Map<string, number>();
  for (const b of computeBalances(entries)) net.set(b.userId, b.netAmount);

  const liveIds = new Set(members.map((m) => m.id));
  const padded: Balance[] = members.map((m) => ({ userId: m.id, netAmount: net.get(m.id) ?? 0 }));
  // A removed member (balance 0 by rule) may still appear in history; keep any non-zero stray so the
  // balances keep summing to 0 instead of silently dropping money.
  for (const [id, amount] of net) {
    if (!liveIds.has(id) && Math.abs(amount) > 0.005) padded.push({ userId: id, netAmount: amount });
  }

  return {
    balances: padded.map((b) => ({ memberId: b.userId, netAmount: round2(b.netAmount) })),
    suggestedTransfers: simplifyDebts(padded).map((t) => ({
      fromMemberId: t.fromUserId,
      toMemberId: t.toUserId,
      amount: t.amount,
    })),
  };
}

export type SettlementRejection = 'same_member' | 'too_small' | 'not_debtor' | 'not_creditor' | 'exceeds_balance';

export type SettlementCheck = { ok: true; amount: number } | { ok: false; reason: SettlementRejection };

/** A balance counts as non-zero from half a cent, so a rounding residue never makes a debtor. */
const BALANCE_EPSILON = 0.005;

/**
 * The most `from` may pay `to` right now (ABA-652): `min(what from owes, what to is owed)`, or null
 * when `from` is not a debtor or `to` is not a creditor. A payment up to this bound only SHRINKS
 * both balances toward zero and never flips a sign.
 */
export function maxSettlementAmount(
  fromMemberId: string,
  toMemberId: string,
  balances: LedgerBalance[],
): number | null {
  if (fromMemberId === toMemberId) return null;
  const net = (id: string) => balances.find((b) => b.memberId === id)?.netAmount ?? 0;
  const from = net(fromMemberId);
  const to = net(toMemberId);
  if (from > -BALANCE_EPSILON || to < BALANCE_EPSILON) return null;
  return round2(Math.min(-from, to));
}

/**
 * Validates a proposed settlement against the CURRENT balances (ABA-652; replaced the
 * "must equal a suggested transfer" rule). Valid when `from` owes, `to` is owed, and
 * `0.01 <= amount <= min(-balance[from], balance[to]) + 0.01`. The amount to STORE is returned
 * clamped to that bound, so the cent of tolerance can never flip a sign. Every suggested transfer
 * passes, because `simplifyDebts` never exceeds either side. Call before any write.
 * The acting-member rule (actor is from or to) is the caller's, not this function's.
 */
export function validateSettlement(
  proposed: { fromMemberId: string; toMemberId: string; amount: number },
  balances: LedgerBalance[],
): SettlementCheck {
  if (proposed.fromMemberId === proposed.toMemberId) return { ok: false, reason: 'same_member' };
  if (!Number.isFinite(proposed.amount) || round2(proposed.amount) < 0.01) return { ok: false, reason: 'too_small' };
  const net = (id: string) => balances.find((b) => b.memberId === id)?.netAmount ?? 0;
  if (net(proposed.fromMemberId) > -BALANCE_EPSILON) return { ok: false, reason: 'not_debtor' };
  if (net(proposed.toMemberId) < BALANCE_EPSILON) return { ok: false, reason: 'not_creditor' };
  const cap = maxSettlementAmount(proposed.fromMemberId, proposed.toMemberId, balances) as number;
  const amount = round2(proposed.amount);
  if (round2(amount - cap) > SETTLE_TOLERANCE) return { ok: false, reason: 'exceeds_balance' };
  return { ok: true, amount: Math.min(amount, cap) };
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/**
 * Sum of `memberId`'s shares over live expenses dated in the calendar month of `now` (UTC, because
 * the column is a date-only value stored at UTC midnight). Display-only.
 */
export function myShareThisMonth(
  memberId: string,
  expenses: (Omit<LedgerExpense, 'paidByMemberId' | 'amount'> & { date: Date | string })[],
  now: Date = new Date(),
): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let total = 0;
  for (const e of expenses) {
    if (e.deletedAt) continue;
    const d = toDate(e.date);
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m) continue;
    for (const s of e.shares) if (s.memberId === memberId) total += s.shareAmount;
  }
  return round2(total);
}
