import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type {
  CategorizeSuggestionsResponse,
  CategorizeIncomeSuggestionsResponse,
  CategorizeCandidateExpense,
  CategorizeCandidateIncome,
} from '@budget/shared-types';
import { api } from '@/services/api';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useAccountStore } from '@/stores/accountStore';
import {
  buildApplyPlan, deriveGroups, initReview, reviewReducer, type ReviewState,
} from './categorizeReview';
import { applyCategorization } from './applyCategorization';
import { shareInFlight } from './shareInFlight';
import { categoryStyle } from './categoryStyle';
import i18n from '@/i18n';

export type CategorizeCandidate = CategorizeCandidateExpense | CategorizeCandidateIncome;
type CategorizeResponse = CategorizeSuggestionsResponse | CategorizeIncomeSuggestionsResponse;

const EMPTY: ReviewState = { targets: {}, drafts: {}, excludedGroups: [] };

// Module scope, so two mounts of the screen share one request per account (see
// shareInFlight). The key is only for sharing — the request itself is scoped by
// the X-Account-Id header the http client stamps when it runs.
//
// Two SEPARATE instances — one per entity type — so an in-flight expense
// categorize request is never handed to an income call site (or vice versa);
// sharing one instance across both would let an income request resolve with
// an expense response.
const fetchExpenseSuggestions = shareInFlight(() => api.categorizeUncategorized());
const fetchIncomeSuggestions = shareInFlight(() => api.categorizeUncategorizedIncome());

/** Loads suggestions once on mount, holds the review, applies it. */
export function useCategorizeSuggestions(entityType: 'expense' | 'income' = 'expense') {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [response, setResponse] = useState<CategorizeResponse | null>(null);
  // The response's candidate array is `expenses` for one entity type and
  // `incomes` for the other — normalized here into one local shape so every
  // consumer downstream (this hook's own `order`/`apply`, and
  // `CategorizeReview.tsx`) works off one field regardless of entityType.
  const [items, setItems] = useState<CategorizeCandidate[]>([]);
  const [state, dispatch] = useReducer(
    (s: ReviewState, a: Parameters<typeof reviewReducer>[1] | { type: 'reset'; state: ReviewState }) =>
      a.type === 'reset' ? a.state : reviewReducer(s, a),
    EMPTY,
  );
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const accountId = useAccountStore.getState().currentAccountId ?? '';
      const r: CategorizeResponse =
        entityType === 'income'
          ? await fetchIncomeSuggestions(accountId)
          : await fetchExpenseSuggestions(accountId);
      setResponse(r);
      const list: CategorizeCandidate[] =
        entityType === 'income'
          ? (r as CategorizeIncomeSuggestionsResponse).incomes
          : (r as CategorizeSuggestionsResponse).expenses;
      setItems(list);
      // `initReview` only reads `.groups`/`.unassigned`, both identically
      // shaped across the two response types — declared as
      // `CategorizeSuggestionsResponse` in categorizeReview.ts, which is
      // otherwise untouched, so the cast is safe.
      dispatch({ type: 'reset', state: initReview(r as CategorizeSuggestionsResponse) });
      setStatus('ready');
    } catch (e: any) {
      console.warn('[categorize] load failed:', e?.message || e);
      setStatus('error');
    }
  }, [entityType]);

  useEffect(() => { void load(); }, [load]);

  const order = useMemo(() => items.map((e) => e.id), [items]);
  const groups = useMemo(() => deriveGroups(state, order), [state, order]);
  const plan = useMemo(() => buildApplyPlan(state, order), [state, order]);

  const apply = useCallback(async () => {
    // Defense in depth: the footer button is already disabled while `applying`,
    // but a caller invoking this twice back-to-back must not double-apply.
    if (!response || applying) return { categorized: 0, created: 0 };
    setApplying(true);
    try {
      const categoryStore = useCategoryStore.getState();
      return await applyCategorization(
        plan,
        // `applyCategorization` only reads `.id`/`.clientId` off each ref —
        // declared as `CategorizeCandidateExpense[]` in applyCategorization.ts,
        // which is otherwise untouched, so the cast is safe for income too.
        items as unknown as CategorizeCandidateExpense[],
        {
          createCategory: (name) => {
            // A proposal named like a default category borrows its icon/colour;
            // anything else gets the neutral folder the review showed for it.
            const style = categoryStyle(name, i18n.t.bind(i18n), entityType);
            return categoryStore.createCategory(name, entityType, style.icon, style.color);
          },
          bulkSetCategory: (ids, categoryId) =>
            entityType === 'income'
              ? useIncomeStore.getState().bulkUpdateIncomes(ids, { categoryId }, { awaitServer: true })
              : useExpenseStore.getState().bulkUpdateExpenses(ids, { categoryId }, { awaitServer: true }),
          localExpenses:
            entityType === 'income'
              ? useIncomeStore.getState().incomes
              : useExpenseStore.getState().expenses,
          existingCategoryIds: new Set(categoryStore.categories.map((c) => c.id)),
        },
      );
    } finally {
      setApplying(false);
    }
  }, [plan, items, response, applying, entityType]);

  return { status, response, items, state, dispatch, groups, plan, apply, applying, retry: load };
}
