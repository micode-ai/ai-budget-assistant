import type {
  AccountRole,
  AccountType,
  CreateGroupCashLinkDto,
  GroupBudgetLinksView,
  GroupBudgetMirrorPauseReason,
  GroupCashLegKind,
  GroupCashLegView,
  GroupCashSuggestionView,
  TripStatus,
} from '@budget/shared-types';
import type { ApiErrorLike } from './groupMath';

/**
 * "Count my share in my budget" (ABA-661, the app half of ABA-660). Pure helpers only: which
 * accounts the mirror may target, the error and pause copy keys, the "may be counted twice" list,
 * the manual-link candidates, and how a share row or a linked payment is marked wherever
 * transactions are drawn. The server re-checks everything; nothing here is a security boundary.
 */

// ------------------------------------------------------------------ transaction marks

export type GroupTransactionMark = 'share' | 'linked' | null;

interface MarkableRow {
  source?: string | null;
  isSplitReceivable?: boolean | null;
  isDebt?: boolean | null;
}

/**
 * `share`: a row the mirror writes (`source: 'group'`, my share of one group expense). `linked`: a
 * payment of mine the mirror linked to a group leg, so it is left out of totals. A linked leg carries
 * `isSplitReceivable` WITHOUT `isDebt`; a receipt-split receivable carries both, and an income is
 * never flagged by a receipt split (ABA-659), so on an income the flag alone means "linked".
 * Absent flags read as false.
 */
export function groupTransactionMark(row: MarkableRow, kind: 'expense' | 'income'): GroupTransactionMark {
  if (kind === 'expense' && row.source === 'group') return 'share';
  if (!row.isSplitReceivable) return null;
  if (kind === 'income') return 'linked';
  return row.isDebt ? null : 'linked';
}

/** Amount, currency and date of a share row belong to the mirror; the server ignores edits to them. */
export function isMirrorOwnedRow(row: { source?: string | null }): boolean {
  return row.source === 'group';
}

/** The server refuses to move a share row or a linked payment (400 EXPENSE_LINKED). */
export function canMoveExpenseRow(row: MarkableRow): boolean {
  return groupTransactionMark(row, 'expense') === null;
}

/** Drops the three mirror-owned fields from an edit of a share row; any other row is unchanged. */
export function stripMirrorOwnedFields<T extends { amount?: unknown; currencyCode?: unknown; date?: unknown }>(
  patch: T,
  mirrorOwned: boolean,
): T {
  if (!mirrorOwned) return patch;
  const { amount: _a, currencyCode: _c, date: _d, ...rest } = patch;
  return rest as T;
}

/**
 * A share row carries no group id, only its description `"<group>: <description>"` (written once, on
 * create). The group is found by the longest group name that prefixes it; two groups with that same
 * name, or a description the user rewrote, give no id (the badge then opens the groups list).
 */
export function resolveShareRowGroup(
  description: string | null | undefined,
  groups: { id: string; name: string }[],
): { groupId: string | null; name: string | null } {
  const text = description ?? '';
  const matches = groups.filter((g) => g.name && text.startsWith(`${g.name}: `));
  if (matches.length === 0) return { groupId: null, name: null };
  const longest = Math.max(...matches.map((g) => g.name.length));
  const best = matches.filter((g) => g.name.length === longest);
  return { groupId: best.length === 1 ? best[0].id : null, name: best[0].name };
}

// ------------------------------------------------------------------ the target account

export interface MirrorAccountLike {
  id: string;
  name: string;
  type: AccountType;
  myRole: AccountRole;
  isActive?: boolean;
  tripStatus?: TripStatus;
}

/**
 * Accounts the mirror may target: active, not an archived trip, and either one I OWN, or a personal
 * account I can edit that has no other member. Share rows and flagged payments change the figures of
 * everyone in a shared account, so the server lets only its owner point a mirror at it (403
 * MIRROR_ACCOUNT_SHARED_NEEDS_OWNER). `memberCounts` is what the device knows; an editor's personal
 * account with an unknown count is offered and the server has the last word.
 */
export function mirrorAccountCandidates<T extends MirrorAccountLike>(
  accounts: T[],
  memberCounts: Record<string, number | undefined> = {},
): T[] {
  return accounts.filter((a) => {
    if (a.isActive === false || (a.type === 'trip' && a.tripStatus === 'archived')) return false;
    if (a.myRole === 'owner') return true;
    if (a.myRole !== 'editor' || a.type !== 'personal') return false;
    const count = memberCounts[a.id];
    return count === undefined || count <= 1;
  });
}

/**
 * Splits the candidates by end-to-end encryption. Any tier above 0 is not offered: the server writes
 * a share row's description in plain text, and tier 1 already encrypts descriptions. An unknown tier
 * (its lookup failed) is offered; the server refuses it with MIRROR_ACCOUNT_ENCRYPTED if needed.
 */
export function splitByEncryption<T extends { id: string }>(
  candidates: T[],
  tiers: Record<string, number | null | undefined>,
): { offered: T[]; encrypted: T[] } {
  const offered: T[] = [];
  const encrypted: T[] = [];
  for (const a of candidates) {
    const tier = tiers[a.id];
    if (typeof tier === 'number' && tier > 0) encrypted.push(a);
    else offered.push(a);
  }
  return { offered, encrypted };
}

// ------------------------------------------------------------------ errors and pause copy

export type MirrorErrorReason =
  | 'accountNotFound'
  | 'readOnly'
  | 'encrypted'
  | 'archived'
  | 'sharedNeedsOwner'
  | 'categoryNotFound'
  | 'mirrorOff'
  | 'legAlreadyLinked'
  | 'rowNotLinkable'
  | 'legNotFound'
  | 'rowNotFound'
  | 'gone'
  | 'invalid'
  | null;

const ERROR_CODES: Record<string, Exclude<MirrorErrorReason, null>> = {
  ACCOUNT_NOT_FOUND: 'accountNotFound',
  MIRROR_ACCOUNT_READ_ONLY: 'readOnly',
  MIRROR_ACCOUNT_ENCRYPTED: 'encrypted',
  MIRROR_ACCOUNT_ARCHIVED: 'archived',
  MIRROR_ACCOUNT_SHARED_NEEDS_OWNER: 'sharedNeedsOwner',
  CATEGORY_NOT_FOUND: 'categoryNotFound',
  MIRROR_OFF: 'mirrorOff',
  LEG_ALREADY_LINKED: 'legAlreadyLinked',
  ROW_NOT_LINKABLE: 'rowNotLinkable',
  LEG_NOT_FOUND: 'legNotFound',
  ROW_NOT_FOUND: 'rowNotFound',
  SUGGESTION_NOT_FOUND: 'gone',
  LINK_NOT_FOUND: 'gone',
  LINK_INVALID: 'invalid',
};

/** Maps a mirror or link failure to its copy (`groupBudget.error_<reason>`); null = a generic error. */
export function mirrorErrorReason(err: unknown): MirrorErrorReason {
  const e = err as ApiErrorLike | null | undefined;
  if (!e || typeof e.code !== 'string') return null;
  return ERROR_CODES[e.code] ?? null;
}

/** The `groupBudget.paused_<reason>` key; an unknown reason falls back to the generic one. */
export function pausedReasonKey(reason: GroupBudgetMirrorPauseReason | null | undefined): string {
  switch (reason) {
    case 'viewer':
    case 'encrypted':
    case 'archived':
      return `groupBudget.paused_${reason}`;
    default:
      return 'groupBudget.paused_account_unavailable';
  }
}

// ------------------------------------------------------------------ "may be counted twice"

export function legKey(leg: Pick<GroupCashLegView, 'kind' | 'groupExpenseId' | 'settlementId'>): string {
  return `${leg.kind}:${leg.groupExpenseId ?? leg.settlementId ?? ''}`;
}

/** Which side of my books a leg lands on: a settlement to me is an income, everything else an expense. */
export function legSide(kind: GroupCashLegKind): 'expense' | 'income' {
  return kind === 'settlement_in' ? 'income' : 'expense';
}

export interface DoubleCountLeg {
  key: string;
  leg: GroupCashLegView;
  suggestions: GroupCashSuggestionView[];
}

/**
 * Every leg with no linked personal row, each with the suggestions offered for it, newest first. A
 * suggestion whose leg is somehow not in `unlinked` still gets its own entry, so nothing the server
 * sent is dropped.
 */
export function doubleCountLegs(view: Pick<GroupBudgetLinksView, 'unlinked' | 'suggestions'> | null | undefined): DoubleCountLeg[] {
  if (!view) return [];
  const byKey = new Map<string, DoubleCountLeg>();
  for (const leg of view.unlinked) {
    const key = legKey(leg);
    if (!byKey.has(key)) byKey.set(key, { key, leg, suggestions: [] });
  }
  for (const s of view.suggestions) {
    const key = legKey(s.leg);
    const entry = byKey.get(key) ?? { key, leg: s.leg, suggestions: [] };
    entry.suggestions.push(s);
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => (a.leg.date < b.leg.date ? 1 : a.leg.date > b.leg.date ? -1 : 0));
}

/**
 * A leg or share row another member created (the server never auto-links those): the name to show,
 * or null when it is my own entry. A missing name still marks it, with a generic label.
 */
export function addedByOtherName(item: { addedByOther?: boolean; addedByName?: string | null } | null | undefined): string | null | undefined {
  if (!item?.addedByOther) return undefined;
  return item.addedByName?.trim() || null;
}

/** The detail card shows while the mirror is on (active or paused): it is where the honest limit lives. */
export function showBudgetLinksCard(view: Pick<GroupBudgetLinksView, 'mirror'> | null | undefined): boolean {
  return !!view && view.mirror.status !== 'off';
}

// ------------------------------------------------------------------ manual link

export interface LinkCandidateRow {
  id: string;
  userId?: string | null;
  accountId?: string | null;
  amount: number | string;
  currencyCode: string;
  date: string | Date;
  description?: string | null;
  merchant?: string | null;
  source?: string | null;
  isDeleted?: boolean | null;
  isDebt?: boolean | null;
  isDebtRepayment?: boolean | null;
  isPlanned?: boolean | null;
  isSplitReceivable?: boolean | null;
}

/** Days either side of the leg's date a manual link may reach. */
export const MANUAL_LINK_WINDOW_DAYS = 30;
export const MANUAL_LINK_MAX = 30;
const DAY_MS = 86_400_000;

function dayOf(d: string | Date): number {
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return Date.parse(`${s}T00:00:00Z`);
}

/** The window (YYYY-MM-DD) to fetch candidate rows for one leg. */
export function manualLinkWindow(legDate: string): { startDate: string; endDate: string } {
  const day = dayOf(legDate);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    startDate: iso(day - MANUAL_LINK_WINDOW_DAYS * DAY_MS),
    endDate: iso(day + MANUAL_LINK_WINDOW_DAYS * DAY_MS),
  };
}

/**
 * The rows I could link one leg to by hand: mine, in the mirror's account, live, not a debt, a
 * repayment, a planned purchase, already flagged, or a share row (the server's LINKABLE rule; a live
 * receipt split is checked only there). Closest first: same currency, then amount, then date.
 */
export function manualLinkCandidates<T extends LinkCandidateRow>(
  leg: Pick<GroupCashLegView, 'amount' | 'currencyCode' | 'date'>,
  rows: T[],
  scope: { userId: string | null | undefined; accountId: string },
): T[] {
  const legDay = dayOf(leg.date);
  const linkable = rows.filter(
    (r) =>
      !r.isDeleted &&
      !r.isDebt &&
      !r.isDebtRepayment &&
      !r.isPlanned &&
      !r.isSplitReceivable &&
      r.source !== 'group' &&
      (!r.accountId || r.accountId === scope.accountId) &&
      (!scope.userId || !r.userId || r.userId === scope.userId) &&
      Math.abs(dayOf(r.date) - legDay) <= MANUAL_LINK_WINDOW_DAYS * DAY_MS,
  );
  const score = (r: T) => ({
    currency: r.currencyCode === leg.currencyCode ? 0 : 1,
    amount: Math.abs(Number(r.amount) - leg.amount),
    days: Math.abs(dayOf(r.date) - legDay),
  });
  return linkable
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => a.s.currency - b.s.currency || a.s.amount - b.s.amount || a.s.days - b.s.days)
    .slice(0, MANUAL_LINK_MAX)
    .map((x) => x.r);
}

/** The POST body linking `leg` to my row `rowId`. */
export function buildManualLinkDto(leg: Pick<GroupCashLegView, 'kind' | 'groupExpenseId' | 'settlementId'>, rowId: string): CreateGroupCashLinkDto {
  const dto: CreateGroupCashLinkDto = { kind: leg.kind };
  if (leg.kind === 'payer_expense') dto.groupExpenseId = leg.groupExpenseId ?? undefined;
  else dto.settlementId = leg.settlementId ?? undefined;
  if (legSide(leg.kind) === 'income') dto.incomeId = rowId;
  else dto.expenseId = rowId;
  return dto;
}
