import type {
  GroupExpense,
  GroupExpenseShareInputDto,
  ShareType,
} from '@budget/shared-types';

/**
 * Pure split-form logic for the group expense screen. Mirrors what the API enforces
 * (`resolveShares` throws on an exact split that does not add up) so the screen can disable Save
 * with a specific reason instead of surfacing a raw 400. Same shape as `validateTripSplit` /
 * `validateSplit`: values in, a verdict out, unit-tested because nothing renders in CI.
 */

export const GROUP_SPLIT_TYPES: ShareType[] = ['equal', 'exact', 'percentage', 'shares'];

/** Mirrors the API's amount bounds and length caps. */
export const MAX_GROUP_AMOUNT = 1_000_000;
export const MAX_DESCRIPTION_LENGTH = 120;
export const MAX_GROUP_NAME_LENGTH = 60;
export const MAX_MEMBER_NAME_LENGTH = 40;
export const MAX_PAYMENT_HANDLE_LENGTH = 64;

const TOLERANCE = 0.01;

/** Parses user text ("12,50" or "12.50") to a number; NaN-safe (returns 0). */
export function parseAmount(text: string): number {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export type SplitIssue = 'noMembers' | 'valueMissing' | 'exactSum' | 'percentSum';

export interface SplitDraft {
  splitType: ShareType;
  /** The ids of the members taking part, in display order. */
  selectedIds: string[];
  /** Raw text per member id: an amount, a percentage or a number of shares. */
  values: Record<string, string>;
}

/** Why the split cannot be saved, or null when it can. `amount` is the expense total. */
export function validateGroupSplit(draft: SplitDraft, amount: number): SplitIssue | null {
  if (draft.selectedIds.length === 0) return 'noMembers';
  if (draft.splitType === 'equal') return null;

  const values = draft.selectedIds.map((id) => parseAmount(draft.values[id] ?? ''));
  if (draft.splitType === 'shares') {
    return values.some((v) => v <= 0) ? 'valueMissing' : null;
  }

  const sum = values.reduce((a, v) => a + v, 0);
  if (draft.splitType === 'exact') {
    return Math.abs(sum - amount) <= TOLERANCE ? null : 'exactSum';
  }
  return Math.abs(sum - 100) <= TOLERANCE ? null : 'percentSum';
}

/** What is still unassigned: exact -> currency left, percentage -> percent left. */
export function splitRemainder(draft: SplitDraft, amount: number): number {
  const sum = draft.selectedIds.reduce((a, id) => a + parseAmount(draft.values[id] ?? ''), 0);
  if (draft.splitType === 'exact') return Math.round((amount - sum) * 100) / 100;
  if (draft.splitType === 'percentage') return Math.round((100 - sum) * 100) / 100;
  return 0;
}

export function buildShareInputs(draft: SplitDraft): GroupExpenseShareInputDto[] {
  return draft.selectedIds.map((memberId) =>
    draft.splitType === 'equal'
      ? { memberId }
      : { memberId, value: parseAmount(draft.values[memberId] ?? '') },
  );
}

/** Even preview for the equal split; display only, the server resolves the real cents. */
export function equalShare(amount: number, count: number): number {
  return count > 0 ? Math.round((amount / count) * 100) / 100 : 0;
}

export interface ExpenseFormValidity {
  ok: boolean;
  issue: SplitIssue | 'amount' | 'description' | 'payer' | null;
}

export function validateExpenseForm(input: {
  description: string;
  amount: number;
  paidByMemberId: string | null;
  draft: SplitDraft;
}): ExpenseFormValidity {
  const description = input.description.trim();
  if (description.length === 0 || description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, issue: 'description' };
  }
  if (!(input.amount > 0) || input.amount > MAX_GROUP_AMOUNT) return { ok: false, issue: 'amount' };
  if (!input.paidByMemberId) return { ok: false, issue: 'payer' };
  const issue = validateGroupSplit(input.draft, input.amount);
  return issue ? { ok: false, issue } : { ok: true, issue: null };
}

/**
 * Seeds the split form. A new expense starts as an equal split between every live member; an
 * edited one restores its own type, participants and raw values.
 */
export function initialSplitDraft(
  liveMemberIds: string[],
  expense?: Pick<GroupExpense, 'splitType' | 'shares'> | null,
): SplitDraft {
  if (!expense) return { splitType: 'equal', selectedIds: [...liveMemberIds], values: {} };
  const values: Record<string, string> = {};
  for (const s of expense.shares) {
    if (expense.splitType !== 'equal' && s.shareValue !== null) values[s.memberId] = String(s.shareValue);
  }
  return {
    splitType: expense.splitType,
    selectedIds: expense.shares.map((s) => s.memberId),
    values,
  };
}
