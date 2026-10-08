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

/**
 * True when the proposed settlement matches a current suggested transfer (same direction, amount
 * within 0.01). Call before any write.
 */
export function isValidSettlement(
  proposed: { fromMemberId: string; toMemberId: string; amount: number },
  suggested: LedgerTransfer[],
): boolean {
  return suggested.some(
    (t) =>
      t.fromMemberId === proposed.fromMemberId &&
      t.toMemberId === proposed.toMemberId &&
      round2(Math.abs(t.amount - proposed.amount)) <= SETTLE_TOLERANCE,
  );
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
