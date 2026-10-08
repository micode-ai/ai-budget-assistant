import type { ShareType, SettleMethod } from './primitives';

export type ExpenseGroupStatus = 'active' | 'archived';

export interface ExpenseGroup {
  id: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
  ownerUserId: string;
  guestAccess: boolean;
  status: ExpenseGroupStatus;
  ledgerVersion: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  displayName: string;
  /** True when the member is linked to an app user; false for a browser guest. */
  isAppUser: boolean;
  /** True when a guest device has taken this placeholder. */
  isClaimed: boolean;
  paymentMethod: SettleMethod | null;
  paymentHandle: string | null;
  removedAt: string | null;
  createdAt: string;
}

export interface GroupExpenseShare {
  memberId: string;
  /** Raw input (exact amount / percent / units); null for an equal split. */
  shareValue: number | null;
  shareAmount: number;
}

export interface GroupExpense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  /** Date-only, YYYY-MM-DD. */
  date: string;
  paidByMemberId: string;
  splitType: ShareType;
  createdByMemberId: string;
  shares: GroupExpenseShare[];
  deletedAt: string | null;
  deletedByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupSettlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  method: SettleMethod | null;
  recordedByMemberId: string;
  voidedAt: string | null;
  voidedByMemberId: string | null;
  createdAt: string;
}

/** Positive netAmount = is owed money, negative = owes money. */
export interface GroupBalance {
  memberId: string;
  netAmount: number;
}

export interface GroupTransfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}
