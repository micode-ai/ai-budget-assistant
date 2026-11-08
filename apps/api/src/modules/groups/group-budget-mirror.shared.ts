import type { GroupBudgetMirrorPauseReason } from '@budget/shared-types';
import type { CashLeg } from './group-budget-mirror';

export const DAY_MS = 86_400_000;
export const isP2002 = (e: unknown) => (e as { code?: string })?.code === 'P2002';
export const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);
/** At most this many personal rows are read as candidates per pass (a month of one account). */
export const MAX_CANDIDATES = 1000;
/** Deterministic, so a month with more rows than the cap never flips which ones are considered. */
export const CANDIDATE_ORDER = [{ date: 'desc' as const }, { id: 'asc' as const }];
/** One "someone added a payment that may be yours" push per member and group per this many seconds. */
export const SUGGESTION_PUSH_COALESCE_SECONDS = 600;

/**
 * Who may be linked: an ordinary row of mine that no other mechanism accounts for already. A debt,
 * a debt repayment, a planned purchase, a row already flagged (a receipt split's receivable or
 * another group's leg), a share row, or a receipt with a live split can never be a group cash leg.
 */
export const LINKABLE_EXPENSE = {
  isDeleted: false,
  isDebt: false,
  isDebtRepayment: false,
  isSplitReceivable: false,
  isPlanned: false,
  source: { not: 'group' },
  groupCashLink: { is: null },
  splitParticipants: { none: { cancelledAt: null } },
} as const;
export const LINKABLE_INCOME = {
  isDeleted: false,
  isDebt: false,
  isDebtRepayment: false,
  isSplitReceivable: false,
  groupCashLink: { is: null },
} as const;

/**
 * ABA-660 review L2: clearing `isSplitReceivable` is only ever the mirror undoing ITS OWN flag. A row
 * that is a receipt with live split participants carries the flag for the receipt split, so a clear
 * is refused for it whatever a link row says.
 */
export const NOT_A_LIVE_RECEIPT_SPLIT = { splitParticipants: { none: { cancelledAt: null } } } as const;

export type Eligibility =
  | { ok: true; account: { id: string; currencyCode: string; type: string; role: string } }
  | { ok: false; reason: GroupBudgetMirrorPauseReason };

export interface MirrorMember {
  id: string;
  groupId: string;
  userId: string;
  budgetMirrorFrom: Date;
  budgetAccountId: string;
  budgetCategoryId: string | null;
  group: { id: string; name: string; currencyCode: string };
}

export interface LegData {
  legs: CashLeg[];
  labels: Map<string, string>;
  expenses: Array<{ id: string; description: string; date: Date; share: number; addedByMe: boolean; addedByName: string | null }>;
}
