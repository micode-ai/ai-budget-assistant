import type { Prisma } from '@prisma/client';
import type { GroupExpense, GroupFxRateSource, GroupMember, GroupSettlement } from '@budget/shared-types';

type MemberRow = Prisma.ExpenseGroupMemberGetPayload<object>;
/** `shares` is optional: the list queries include it, the ledger writes do not read it back. */
type ExpenseRow = Prisma.GroupExpenseGetPayload<object> & {
  shares?: Pick<Prisma.GroupExpenseShareGetPayload<object>, 'memberId' | 'shareValue' | 'shareAmount'>[];
};

export const toMember = (m: MemberRow): GroupMember => {
  // Never expose userId: only isAppUser / isClaimed.
  return {
    id: m.id,
    groupId: m.groupId,
    displayName: m.displayName,
    isAppUser: !!m.userId,
    isClaimed: !!m.claimTokenHash,
    paymentMethod: m.paymentMethod ?? null,
    paymentHandle: m.paymentHandle ?? null,
    removedAt: m.removedAt ? new Date(m.removedAt).toISOString() : null,
    createdAt: new Date(m.createdAt).toISOString(),
  };
};

export const toExpense = (e: ExpenseRow): GroupExpense => {
  return {
    id: e.id,
    groupId: e.groupId,
    description: e.description,
    amount: Number(e.amount),
    date: new Date(e.date).toISOString().slice(0, 10),
    paidByMemberId: e.paidByMemberId,
    splitType: e.splitType,
    createdByMemberId: e.createdByMemberId,
    shares: (e.shares ?? []).map((s) => ({
      memberId: s.memberId,
      shareValue: s.shareValue == null ? null : Number(s.shareValue),
      shareAmount: Number(s.shareAmount),
    })),
    // ABA-654: the figures as ENTERED. Null = entered in the group currency. Read as stored, never re-converted.
    originalAmount: e.originalAmount == null ? null : Number(e.originalAmount),
    originalCurrency: e.originalCurrency ?? null,
    fxRate: e.fxRate == null ? null : Number(e.fxRate),
    fxRateSource: (e.fxRateSource as GroupFxRateSource | null) ?? null,
    fxRateAt: e.fxRateAt ? new Date(e.fxRateAt).toISOString() : null,
    // ABA-655: lines are fetched separately (GET .../items); the shares above are already resolved.
    itemized: e.itemized === true,
    discountAmount: e.discountAmount == null ? null : Number(e.discountAmount),
    claimsOpenUntil: e.claimsOpenUntil ? new Date(e.claimsOpenUntil).toISOString() : null,
    deletedAt: e.deletedAt ? new Date(e.deletedAt).toISOString() : null,
    deletedByMemberId: e.deletedByMemberId ?? null,
    createdAt: new Date(e.createdAt).toISOString(),
    updatedAt: new Date(e.updatedAt).toISOString(),
  };
};

export const toSettlement = (s: Prisma.GroupSettlementGetPayload<object>): GroupSettlement => {
  return {
    id: s.id,
    groupId: s.groupId,
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    amount: Number(s.amount),
    method: s.method ?? null,
    recordedByMemberId: s.recordedByMemberId,
    voidedAt: s.voidedAt ? new Date(s.voidedAt).toISOString() : null,
    voidedByMemberId: s.voidedByMemberId ?? null,
    createdAt: new Date(s.createdAt).toISOString(),
  };
};
