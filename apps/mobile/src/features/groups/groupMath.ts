import type { GroupDetail, GroupTransfer } from '@budget/shared-types';

export interface ApiErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

export type SettleResult = { ok: true } | { ok: false; reason: 'ledgerChanged' };

/** True when the error is the settle-up CAS rejection (HTTP 409 + code LEDGER_CHANGED). */
export function isLedgerChanged(err: unknown): boolean {
  const e = err as ApiErrorLike | null | undefined;
  return !!e && e.status === 409 && e.code === 'LEDGER_CHANGED';
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
