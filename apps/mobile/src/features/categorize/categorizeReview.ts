import type { CategorizeSuggestionsResponse } from '@budget/shared-types';

/**
 * State of the "categorize uncategorized" review. Groups are DERIVED from each
 * row's chosen target, so moving a row is just changing its target — there is
 * no second list to keep in sync. Pure: the screen and the desktop dialog both
 * drive it through `useCategorizeSuggestions`.
 */

export type Target =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'new'; draftKey: string }
  | { kind: 'skip' };

export interface ReviewState {
  targets: Record<string, Target>;
  drafts: Record<string, string>;
  excludedGroups: string[];
}

export type ReviewAction =
  | { type: 'setRowTarget'; expenseId: string; target: Target }
  | { type: 'setGroupTarget'; groupKey: string; target: Target }
  | { type: 'addDraft'; draftKey: string; name: string }
  | { type: 'renameDraft'; draftKey: string; name: string }
  | { type: 'toggleGroup'; groupKey: string };

export interface ReviewGroup {
  key: string;
  target: Target;
  expenseIds: string[];
  included: boolean;
}

export interface ApplyPlan {
  newCategories: { draftKey: string; name: string }[];
  assignments: { target: Exclude<Target, { kind: 'skip' }>; expenseIds: string[] }[];
  expenseCount: number;
}

export function groupKeyOf(t: Target): string {
  if (t.kind === 'skip') return 'skip';
  return t.kind === 'new' ? `new:${t.draftKey}` : `existing:${t.categoryId}`;
}

export function initReview(r: CategorizeSuggestionsResponse): ReviewState {
  const targets: Record<string, Target> = {};
  const drafts: Record<string, string> = {};
  let n = 0;
  for (const g of r.groups) {
    let target: Target;
    if (g.categoryId) {
      target = { kind: 'existing', categoryId: g.categoryId };
    } else {
      const draftKey = `p${n++}`;
      drafts[draftKey] = g.proposedName ?? '';
      target = { kind: 'new', draftKey };
    }
    for (const id of g.expenseIds) targets[id] = target;
  }
  for (const id of r.unassigned) targets[id] = { kind: 'skip' };
  return { targets, drafts, excludedGroups: [] };
}

export function reviewReducer(s: ReviewState, a: ReviewAction): ReviewState {
  switch (a.type) {
    case 'setRowTarget':
      return { ...s, targets: { ...s.targets, [a.expenseId]: a.target } };
    case 'setGroupTarget': {
      const targets = { ...s.targets };
      for (const [id, t] of Object.entries(s.targets)) {
        if (groupKeyOf(t) === a.groupKey) targets[id] = a.target;
      }
      return { ...s, targets };
    }
    case 'addDraft':
    case 'renameDraft':
      return { ...s, drafts: { ...s.drafts, [a.draftKey]: a.name } };
    case 'toggleGroup':
      return {
        ...s,
        excludedGroups: s.excludedGroups.includes(a.groupKey)
          ? s.excludedGroups.filter((k) => k !== a.groupKey)
          : [...s.excludedGroups, a.groupKey],
      };
  }
}

const RANK: Record<Target['kind'], number> = { new: 0, existing: 1, skip: 2 };

export function deriveGroups(s: ReviewState, order: string[]): ReviewGroup[] {
  const byKey = new Map<string, ReviewGroup>();
  for (const id of order) {
    const target = s.targets[id];
    if (!target) continue;
    const key = groupKeyOf(target);
    let g = byKey.get(key);
    if (!g) {
      g = { key, target, expenseIds: [], included: target.kind !== 'skip' && !s.excludedGroups.includes(key) };
      byKey.set(key, g);
    }
    g.expenseIds.push(id);
  }
  return [...byKey.values()].sort((a, b) => RANK[a.target.kind] - RANK[b.target.kind]);
}

export function buildApplyPlan(s: ReviewState, order: string[]): ApplyPlan {
  const newCategories: ApplyPlan['newCategories'] = [];
  const assignments: ApplyPlan['assignments'] = [];
  let expenseCount = 0;
  for (const g of deriveGroups(s, order)) {
    if (!g.included || g.target.kind === 'skip') continue;
    if (g.target.kind === 'new') {
      const name = (s.drafts[g.target.draftKey] ?? '').trim();
      if (!name) continue;
      newCategories.push({ draftKey: g.target.draftKey, name });
    }
    assignments.push({ target: g.target, expenseIds: g.expenseIds });
    expenseCount += g.expenseIds.length;
  }
  return { newCategories, assignments, expenseCount };
}
