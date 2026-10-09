import type { ShareType, SettleMethod } from '../entities/primitives';
import type {
  ExpenseGroupStatus,
  GroupBalance,
  GroupExpense,
  GroupExpenseItemView,
  GroupExpenseShare,
  GroupMember,
  GroupMemberEventView,
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
  /** ABA-657: after a 409 ALREADY_MEMBER with `canMerge`, fold the guest row into the caller's row. */
  merge?: boolean;
}

/** `details` of the 409 ALREADY_MEMBER from `POST /groups/link-guest` (ABA-657). */
export interface GroupLinkAlreadyMemberDetails {
  /** True when the caller's own row is live, so the guest row can be merged into it. */
  canMerge: boolean;
  /** The guest row the code was minted for. */
  guestName: string;
  /** The caller's existing row in that group. */
  myName: string;
  /**
   * The guest row's current net balance in the group currency (positive: owed money), so the merge is
   * confirmed knowing what moves. Additive: absent from older servers.
   */
  guestBalance?: number;
  /** The group's currency, the unit of `guestBalance`. */
  currencyCode?: string;
}

/** POST /groups/:groupId/members/:memberId/merge (ABA-657): `memberId` is absorbed into `intoMemberId`. */
export interface MergeGroupMemberDto {
  intoMemberId: string;
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

/** ABA-655: one line of an itemised expense, in the entry currency. `id` only on an edit (keeps the line and its claims). */
export interface GroupExpenseItemInputDto {
  id?: string;
  name: string;
  totalPrice: number;
  lineDiscount?: number;
}

export interface CreateGroupExpenseDto {
  clientRequestId: string;
  description: string;
  /** What was paid, in the entry currency: the lines, minus discounts, plus anything that is not a line (a deposit). */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  paidByMemberId: string;
  /** Required unless `items` is sent (an itemised expense is resolved from claims). */
  splitType?: ShareType;
  /** Required unless `items` is sent. */
  shares?: GroupExpenseShareInputDto[];
  /** ABA-655: presence makes the expense itemised (1..100 lines). Claims open for 7 days; the payer keeps everything unclaimed. */
  items?: GroupExpenseItemInputDto[];
  /** ABA-655: basket-wide discount, entry currency; scales every claim by (lines - discount) / lines. */
  discountAmount?: number;
  /** ABA-654: the currency `amount` is entered in; default the group's. Converted once, at write time. */
  currencyCode?: string;
  /** Manual override: the value of 1 `currencyCode` in the group currency. */
  fxRate?: number;
}

export interface UpdateGroupExpenseDto {
  description?: string;
  amount?: number;
  date?: string;
  paidByMemberId?: string;
  splitType?: ShareType;
  shares?: GroupExpenseShareInputDto[];
  /** ABA-654: a new currency fetches a new rate (or takes `fxRate`); a new amount alone reuses the stored rate. */
  currencyCode?: string;
  fxRate?: number;
  /**
   * ABA-655, itemised expenses only: the full new line list. A line with an `id` is kept (with its
   * claims), one without is new, a missing one is deleted with its claims. `splitType`/`shares` are
   * refused on an itemised expense (400 EXPENSE_ITEMIZED).
   */
  items?: GroupExpenseItemInputDto[];
  /** ABA-655, itemised only; null clears it. */
  discountAmount?: number | null;
}

/** PUT /groups/:groupId/expenses/:expenseId/claims/me (ABA-655): the caller's full set of claimed lines. */
export interface SetMyGroupClaimsDto {
  itemIds: string[];
}

/** One member's claims as set by the payer, creator or owner (ABA-655). */
export interface GroupClaimEntryDto {
  memberId: string;
  /** The member's full set of claimed lines on this expense ([] removes every claim). */
  itemIds: string[];
  /**
   * Explicit shares in basis points keyed by item id; only for lines in `itemIds`, whole numbers
   * 0..10000, at most 10000 per line across members. Omitted = keep the member's stored shares on
   * the lines they keep. Sent = the member's full map (a line absent from it divides equally).
   */
  shareBp?: Record<string, number>;
}

/** PUT /groups/:groupId/expenses/:expenseId/claims (ABA-655): payer, creator or owner, any time. */
export interface SetGroupClaimsDto {
  claims: GroupClaimEntryDto[];
}

/** POST /groups/:groupId/expenses/:expenseId/claims/close (ABA-655). `reopen` opens it for another 7 days. */
export interface CloseGroupClaimsDto {
  reopen?: boolean;
}

/** GET /groups/:groupId/expenses/:expenseId/items, and the answer of every claim write (ABA-655). */
export interface GroupExpenseItemsView {
  expenseId: string;
  description: string;
  groupCurrency: string;
  /** The currency the lines and `discountAmount` are in: the expense's original currency, else the group's. */
  itemCurrency: string;
  /** Group currency. */
  amount: number;
  /** Entry currency; null when entered in the group currency. */
  originalAmount: number | null;
  discountAmount: number | null;
  paidByMemberId: string;
  createdByMemberId: string;
  claimsOpenUntil: string | null;
  /** Every live member may claim their own lines right now. */
  claimsOpen: boolean;
  /** The caller is the payer, creator or owner: may edit anyone's claims and shares, close and reopen. */
  canManageClaims: boolean;
  /** The caller may change their own claims now (open, or a manager), and the group is active. */
  canClaim: boolean;
  items: GroupExpenseItemView[];
  /** The resolved per-member amounts, group currency (the same rows the balances use). */
  shares: GroupExpenseShare[];
  ledgerVersion: number;
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
  /** True when the group has no owner (ABA-650). */
  isOrphaned: boolean;
  /** True when the caller may adopt it: orphaned, active, and a live app-user member from BEFORE the orphaning. */
  canAdopt: boolean;
  myMemberId: string;
  members: GroupMember[];
  balances: GroupBalance[];
  suggestedTransfers: GroupTransfer[];
  ledgerVersion: number;
  guestUrl: string;
  myShareThisMonth: number;
  /**
   * ABA-655: an itemised expense is still open for claims, so amounts may still change. The settle
   * screens show a note while it is true. Always false on an archived group.
   */
  hasOpenItemClaims: boolean;
}

export type GroupActivityItem =
  | { kind: 'expense'; at: string; expense: GroupExpense }
  | { kind: 'settlement'; at: string; settlement: GroupSettlement }
  | { kind: 'event'; at: string; event: GroupMemberEventView };

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

/** GET /groups/:groupId/fx-preview?currency= (ABA-654). `rate` = 1 `currencyCode` in `groupCurrency`; null when unknown. */
export interface GroupFxPreview {
  groupCurrency: string;
  currencyCode: string;
  rate: number | null;
}

/** POST /groups/:groupId/owner (ABA-650): the target must be a live app-user member, not the caller. */
export interface TransferGroupOwnerDto {
  memberId: string;
}
