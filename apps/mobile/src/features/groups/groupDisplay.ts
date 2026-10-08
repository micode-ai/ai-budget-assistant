import type { GroupDetail, GroupMember, GroupTransfer } from '@budget/shared-types';

/** Members still in the group, in the API's order. */
export function liveMembers(detail: Pick<GroupDetail, 'members'>): GroupMember[] {
  return detail.members.filter((m) => !m.removedAt);
}

/**
 * A member's name by id. Removed members stay resolvable (history still shows them), and an id
 * that is not in the list at all falls back to an empty string rather than throwing.
 */
export function memberName(detail: Pick<GroupDetail, 'members'>, memberId: string | null | undefined): string {
  if (!memberId) return '';
  return detail.members.find((m) => m.id === memberId)?.displayName ?? '';
}

export function findMember(detail: Pick<GroupDetail, 'members'>, memberId: string | null | undefined) {
  return memberId ? detail.members.find((m) => m.id === memberId) ?? null : null;
}

/** The balance of one member (0 when absent). */
export function balanceOf(detail: Pick<GroupDetail, 'balances'>, memberId: string): number {
  return detail.balances.find((b) => b.memberId === memberId)?.netAmount ?? 0;
}

/** A group is read-only once archived. */
export function isGroupWritable(detail: Pick<GroupDetail, 'status'> | null | undefined): boolean {
  return !!detail && detail.status === 'active';
}

/** True when any live member has a non-zero balance (within a cent). */
export function hasOpenBalances(detail: Pick<GroupDetail, 'balances'>): boolean {
  return detail.balances.some((b) => Math.abs(b.netAmount) >= 0.01);
}

/** A shared-group member can edit an expense they created or paid for; the owner can edit any. */
export function canModifyExpense(
  detail: Pick<GroupDetail, 'isOwner' | 'myMemberId'>,
  expense: { createdByMemberId: string; paidByMemberId: string },
): boolean {
  return (
    detail.isOwner ||
    expense.createdByMemberId === detail.myMemberId ||
    expense.paidByMemberId === detail.myMemberId
  );
}

/** A settlement can be voided by whoever recorded it, its receiver, or the owner. */
export function canVoidSettlement(
  detail: Pick<GroupDetail, 'isOwner' | 'myMemberId'>,
  settlement: { recordedByMemberId: string; toMemberId: string },
): boolean {
  return (
    detail.isOwner ||
    settlement.recordedByMemberId === detail.myMemberId ||
    settlement.toMemberId === detail.myMemberId
  );
}

/**
 * The suggested transfer a settle screen was opened for, re-resolved against the CURRENT detail.
 * The pair is the identity; the amount in the route is only a hint, because the balances may have
 * moved since the user tapped Settle. Null when that payment is no longer suggested.
 */
export function findCurrentTransfer(
  detail: Pick<GroupDetail, 'suggestedTransfers'>,
  fromMemberId: string | undefined,
  toMemberId: string | undefined,
): GroupTransfer | null {
  if (!fromMemberId || !toMemberId) return null;
  return (
    detail.suggestedTransfers.find((t) => t.fromMemberId === fromMemberId && t.toMemberId === toMemberId) ??
    null
  );
}
