import type { CategorizeSuggestionsResponse } from '@budget/shared-types';
import {
  initReview, reviewReducer, deriveGroups, buildApplyPlan, groupKeyOf,
} from '../categorizeReview';

const exp = (id: string) => ({ id, clientId: null, merchant: id, description: null, amount: 1, currencyCode: 'PLN', date: '2026-09-20' });

const RESPONSE: CategorizeSuggestionsResponse = {
  expenses: ['a', 'b', 'c', 'd', 'e'].map(exp),
  groups: [
    { categoryId: 'tax', proposedName: null, expenseIds: ['a'] },
    { categoryId: null, proposedName: 'Materiały', expenseIds: ['b', 'c'] },
  ],
  unassigned: ['d', 'e'],
  skippedEncrypted: 0,
  remainingToday: 4,
  limitReached: false,
};
const ORDER = RESPONSE.expenses.map((e) => e.id);

describe('categorizeReview', () => {
  it('starts from the server groups, with unassigned rows skipped', () => {
    const s = initReview(RESPONSE);
    expect(s.targets.a).toEqual({ kind: 'existing', categoryId: 'tax' });
    expect(s.targets.b).toEqual({ kind: 'new', draftKey: 'p0' });
    expect(s.drafts).toEqual({ p0: 'Materiały' });
    expect(s.targets.d).toEqual({ kind: 'skip' });
  });

  it('orders groups new first, then existing, then skip', () => {
    const groups = deriveGroups(initReview(RESPONSE), ORDER);
    expect(groups.map((g) => g.key)).toEqual(['new:p0', 'existing:tax', 'skip']);
    expect(groups[2].expenseIds).toEqual(['d', 'e']);
    expect(groups[2].included).toBe(false);
  });

  it('moves a row to another group when its target changes', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'setRowTarget', expenseId: 'd', target: { kind: 'existing', categoryId: 'tax' } });
    const tax = deriveGroups(s, ORDER).find((g) => g.key === 'existing:tax')!;
    expect(tax.expenseIds).toEqual(['a', 'd']);
  });

  it('retargets a whole group at once', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'setGroupTarget', groupKey: 'new:p0', target: { kind: 'existing', categoryId: 'tax' } });
    expect(deriveGroups(s, ORDER).map((g) => g.key)).toEqual(['existing:tax', 'skip']);
    expect(buildApplyPlan(s, ORDER).newCategories).toEqual([]);
  });

  it('renames a draft and adds a new one', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'renameDraft', draftKey: 'p0', name: 'Budowa' });
    s = reviewReducer(s, { type: 'addDraft', draftKey: 'u1', name: 'Podróże' });
    s = reviewReducer(s, { type: 'setRowTarget', expenseId: 'e', target: { kind: 'new', draftKey: 'u1' } });
    const plan = buildApplyPlan(s, ORDER);
    expect(plan.newCategories).toEqual([
      { draftKey: 'p0', name: 'Budowa' },
      { draftKey: 'u1', name: 'Podróże' },
    ]);
  });

  it('leaves out an unchecked group and counts only applied rows', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'toggleGroup', groupKey: 'new:p0' });
    const plan = buildApplyPlan(s, ORDER);
    expect(plan.newCategories).toEqual([]);
    expect(plan.assignments).toEqual([{ target: { kind: 'existing', categoryId: 'tax' }, expenseIds: ['a'] }]);
    expect(plan.expenseCount).toBe(1);
  });

  it('never creates a draft whose name was cleared, and skips its rows', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'renameDraft', draftKey: 'p0', name: '   ' });
    const plan = buildApplyPlan(s, ORDER);
    expect(plan.newCategories).toEqual([]);
    expect(plan.expenseCount).toBe(1);
  });

  it('does not create an unused draft', () => {
    let s = initReview(RESPONSE);
    s = reviewReducer(s, { type: 'addDraft', draftKey: 'u1', name: 'Unused' });
    expect(buildApplyPlan(s, ORDER).newCategories.map((n) => n.draftKey)).toEqual(['p0']);
  });

  it('builds stable group keys', () => {
    expect(groupKeyOf({ kind: 'skip' })).toBe('skip');
    expect(groupKeyOf({ kind: 'new', draftKey: 'x' })).toBe('new:x');
    expect(groupKeyOf({ kind: 'existing', categoryId: 'y' })).toBe('existing:y');
  });
});
