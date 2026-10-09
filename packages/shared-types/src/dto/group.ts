import type { ShareType, SettleMethod } from '../entities/primitives';
import type {
  ExpenseGroupStatus,
  GroupBalance,
  GroupExpense,
  GroupMember,
  GroupSettlement,
  GroupTransfer,
} from '../entities/group';

export interface CreateGroupDto {
  name: string;
  emoji?: string;
  currencyCode: string;
  myDisplayName?: string;
  memberNames?: string[];
}

export interface JoinGroupDto {
  guestToken: string;
  memberId?: string;
  displayName?: string;
}

export interface LinkGuestDto {
  code: string;
}

export interface UpdateGroupDto {
  name?: string;
  emoji?: string | null;
  guestAccess?: boolean;
  currencyCode?: string;
}

export interface UpdateGroupMemberDto {
  displayName?: string;
  paymentMethod?: SettleMethod | null;
  paymentHandle?: string | null;
}

export interface GroupExpenseShareInputDto {
  memberId: string;
  /** Exact amount, percent or units depending on splitType; omitted for equal. */
  value?: number;
}

export interface CreateGroupExpenseDto {
  clientRequestId: string;
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  paidByMemberId: string;
  splitType: ShareType;
  shares: GroupExpenseShareInputDto[];
}

export interface UpdateGroupExpenseDto {
  description?: string;
  amount?: number;
  date?: string;
  paidByMemberId?: string;
  splitType?: ShareType;
  shares?: GroupExpenseShareInputDto[];
}

export interface CreateGroupSettlementDto {
  clientRequestId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  method?: SettleMethod;
  /** The ledgerVersion the transfer was computed against. */
  ledgerVersion: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
  status: ExpenseGroupStatus;
  memberCount: number;
  myBalance: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
  status: ExpenseGroupStatus;
  guestAccess: boolean;
  isOwner: boolean;
  ownerMemberId: string | null;
  myMemberId: string;
  members: GroupMember[];
  balances: GroupBalance[];
  suggestedTransfers: GroupTransfer[];
  ledgerVersion: number;
  guestUrl: string;
  myShareThisMonth: number;
}

export type GroupActivityItem =
  | { kind: 'expense'; at: string; expense: GroupExpense }
  | { kind: 'settlement'; at: string; settlement: GroupSettlement };

export interface GroupActivityPage {
  items: GroupActivityItem[];
  /** ISO cursor to pass as `before`; null when there is no older page. */
  nextBefore: string | null;
}

/** GET /groups/preview?guestToken= — what the app shows before joining by link (ABA-647). */
export interface GroupJoinPreview {
  groupName: string;
  emoji: string | null;
  currencyCode: string;
  /** `archived` means the app must refuse joining (read-only group). */
  status: ExpenseGroupStatus;
  alreadyMember: boolean;
  /** Only when `alreadyMember` and the membership is live. */
  myMemberId?: string;
  /** Only when `alreadyMember`: the group to open. Never given to a non-member. */
  groupId?: string;
  /** Free names to take over: live placeholders nobody has claimed. Id + display name only. */
  unclaimed: Array<{ id: string; displayName: string }>;
}
