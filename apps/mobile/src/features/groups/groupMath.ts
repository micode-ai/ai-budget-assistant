import type { GroupDetail, GroupTransfer } from '@budget/shared-types';

export interface ApiErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

export type SettleResult = { ok: true } | { ok: false; reason: 'ledgerChanged' | 'exceedsBalance' };

/** True when the error is the settle-up CAS rejection (HTTP 409 + code LEDGER_CHANGED). */
export function isLedgerChanged(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  return !!e && e.status === 409 && e.code === 'LEDGER_CHANGED';
}

/** ABA-652: the server refused the amount against the current balances (HTTP 400). */
export function isSettlementExceedsBalance(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  return !!e && e.status === 400 && (e.code === 'SETTLEMENT_EXCEEDS_BALANCE' || e.code === 'SETTLEMENT_MISMATCH');
}

/** link-guest / join: the caller is already a member (HTTP 409). */
export function isAlreadyMember(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  return !!e && e.status === 409 && e.code !== 'LEDGER_CHANGED';
}

/** link-guest: the code is unknown or expired (HTTP 410). */
export function isLinkCodeInvalid(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  return !!e && e.status === 410;
}

export interface MyPosition {
  /** Signed: positive = I am owed, negative = I owe. */
  net: number;
  owed: number;
  owe: number;
}

export function myPosition(detail: Pick<GroupDetail, 'balances' | 'myMemberId'>): MyPosition {
  const net = detail.balances.find((b) => b.memberId === detail.myMemberId)?.netAmount ?? 0;
  return { net, owed: net > 0 ? net : 0, owe: net < 0 ? -net : 0 };
}

export function transfersInvolvingMe(
  detail: Pick<GroupDetail, 'suggestedTransfers' | 'myMemberId'>,
): { iPay: GroupTransfer[]; paidToMe: GroupTransfer[] } {
  const me = detail.myMemberId;
  return {
    iPay: detail.suggestedTransfers.filter((t) => t.fromMemberId === me),
    paidToMe: detail.suggestedTransfers.filter((t) => t.toMemberId === me),
  };
}

// ------------------------------------------------------------ settle amounts (ABA-652)

/** Half a cent: a rounding residue is never a debt (mirrors the API's `BALANCE_EPSILON`). */
const BALANCE_EPSILON = 0.005;
const SETTLE_TOLERANCE = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Client mirror of the API's `maxSettlementAmount`: the most `from` may pay `to` now,
 * `min(what from owes, what to is owed)`, or null when `from` owes nothing or `to` is owed nothing.
 * The server re-checks every payment; this only drives the form.
 */
export function maxSettleAmount(
  balances: GroupDetail['balances'],
  fromMemberId: string | undefined,
  toMemberId: string | undefined,
): number | null {
  if (!fromMemberId || !toMemberId || fromMemberId === toMemberId) return null;
  const net = (id: string) => balances.find((b) => b.memberId === id)?.netAmount ?? 0;
  const from = net(fromMemberId);
  const to = net(toMemberId);
  if (from > -BALANCE_EPSILON || to < BALANCE_EPSILON) return null;
  return round2(Math.min(-from, to));
}

/**
 * The amount a settle form opens with: the suggested transfer for this pair when there is one,
 * otherwise the full bound. Null when the pair cannot settle at all any more.
 */
export function defaultSettleAmount(
  detail: Pick<GroupDetail, 'balances' | 'suggestedTransfers'>,
  fromMemberId: string | undefined,
  toMemberId: string | undefined,
): number | null {
  const max = maxSettleAmount(detail.balances, fromMemberId, toMemberId);
  if (max === null) return null;
  const suggested = detail.suggestedTransfers.find(
    (t) => t.fromMemberId === fromMemberId && t.toMemberId === toMemberId,
  );
  return suggested ? Math.min(suggested.amount, max) : max;
}

export type SettleAmountCheck =
  | { ok: true; amount: number }
  | { ok: false; reason: 'invalid' | 'tooSmall' | 'tooMuch' };

/**
 * Parses what the user typed ("12,50" or "12.50", at most two decimals) against the bound. Within
 * a cent over the bound is accepted and clamped, as the server does.
 */
export function checkSettleAmountInput(text: string, max: number): SettleAmountCheck {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return { ok: false, reason: 'invalid' };
  const amount = round2(Number(t));
  if (amount < 0.01) return { ok: false, reason: 'tooSmall' };
  if (round2(amount - max) > SETTLE_TOLERANCE) return { ok: false, reason: 'tooMuch' };
  return { ok: true, amount: Math.min(amount, max) };
}

export interface SettleCounterpart {
  memberId: string;
  /** The most that can be settled with this member now. */
  max: number;
}

/**
 * "Record a payment" without a suggested row: whom I can settle with. A debtor pays any creditor
 * (`pay`), a creditor records money from any debtor (`receive`). Suggested partners come first, then
 * the API's member order. Empty when I am settled up.
 */
export function settleCounterparts(
  detail: Pick<GroupDetail, 'balances' | 'suggestedTransfers' | 'myMemberId' | 'members'>,
): { direction: 'pay' | 'receive' | null; counterparts: SettleCounterpart[] } {
  const me = detail.myMemberId;
  const mine = detail.balances.find((b) => b.memberId === me)?.netAmount ?? 0;
  const direction = mine <= -BALANCE_EPSILON ? 'pay' : mine >= BALANCE_EPSILON ? 'receive' : null;
  if (!direction) return { direction: null, counterparts: [] };
  const live = new Set(detail.members.filter((m) => !m.removedAt).map((m) => m.id));
  const suggested = new Set(
    detail.suggestedTransfers
      .filter((t) => (direction === 'pay' ? t.fromMemberId === me : t.toMemberId === me))
      .map((t) => (direction === 'pay' ? t.toMemberId : t.fromMemberId)),
  );
  const counterparts: SettleCounterpart[] = [];
  for (const b of detail.balances) {
    if (b.memberId === me || !live.has(b.memberId)) continue;
    const max =
      direction === 'pay' ? maxSettleAmount(detail.balances, me, b.memberId) : maxSettleAmount(detail.balances, b.memberId, me);
    if (max !== null) counterparts.push({ memberId: b.memberId, max });
  }
  counterparts.sort((a, b) => Number(suggested.has(b.memberId)) - Number(suggested.has(a.memberId)));
  return { direction, counterparts };
}

/** The "Record a payment" entry point is offered only when there is someone to settle with. */
export function canRecordPayment(
  detail: Pick<GroupDetail, 'balances' | 'suggestedTransfers' | 'myMemberId' | 'members' | 'status'>,
): boolean {
  return detail.status === 'active' && settleCounterparts(detail).counterparts.length > 0;
}
