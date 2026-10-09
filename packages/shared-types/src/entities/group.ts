import type { ShareType, SettleMethod } from './primitives';

export type ExpenseGroupStatus = 'active' | 'archived';

/** ABA-654: where a group expense's conversion rate came from. */
export type GroupFxRateSource = 'provider' | 'manual';

export interface ExpenseGroup {
  id: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
  /** Null = orphaned (ABA-650): the owner left and nobody could succeed them yet. */
  ownerUserId: string | null;
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
  /**
   * ABA-654. `amount` is ALWAYS the group (ledger) currency. When the expense was entered in another
   * currency these hold what was entered and the rate used ONCE at write time (1 original = fxRate
   * group currency); all null when it was entered in the group currency. Never re-converted on read.
   */
  originalAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  fxRateSource: GroupFxRateSource | null;
  fxRateAt: string | null;
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

/** ABA-650. Shared with the later claim-reset and merge tasks. */
export type GroupMemberEventKind = 'owner_transferred' | 'member_merged' | 'claim_reset';

/**
 * A membership event, shown as a system row in the activity. For `owner_transferred` the fields read:
 * manual transfer = actor and subject are the old owner, target the new one; succession on an
 * account departure = no actor, subject the old owner, target the successor; orphaned = no actor and
 * no target; adoption = subject and target are both the member who took the group over.
 */
export interface GroupMemberEventView {
  id: string;
  kind: GroupMemberEventKind;
  actorMemberId: string | null;
  subjectMemberId: string;
  /** Snapshot at the time of the event (the subject may since have left or been merged). */
  subjectName: string;
  targetMemberId: string | null;
  /** The target's current display name, removed members included; null without a target. */
  targetName: string | null;
  /** The actor's current display name; null when the system acted. */
  actorName: string | null;
  createdAt: string;
}
