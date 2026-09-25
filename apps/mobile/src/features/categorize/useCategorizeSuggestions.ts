import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { CategorizeSuggestionsResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useAccountStore } from '@/stores/accountStore';
import {
  buildApplyPlan, deriveGroups, initReview, reviewReducer, type ReviewState,
} from './categorizeReview';
import { applyCategorization } from './applyCategorization';
import { shareInFlight } from './shareInFlight';
import { categoryStyle } from './categoryStyle';
import i18n from '@/i18n';

const EMPTY: ReviewState = { targets: {}, drafts: {}, excludedGroups: [] };

// Module scope, so two mounts of the screen share one request per account (see
// shareInFlight). The key is only for sharing — the request itself is scoped by
// the X-Account-Id header the http client stamps when it runs.
const fetchSuggestions = shareInFlight(() => api.categorizeUncategorized());

/** Loads suggestions once on mount, holds the review, applies it. */
export function useCategorizeSuggestions() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [response, setResponse] = useState<CategorizeSuggestionsResponse | null>(null);
  const [state, dispatch] = useReducer(
    (s: ReviewState, a: Parameters<typeof reviewReducer>[1] | { type: 'reset'; state: ReviewState }) =>
      a.type === 'reset' ? a.state : reviewReducer(s, a),
    EMPTY,
  );
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const r = await fetchSuggestions(useAccountStore.getState().currentAccountId ?? '');
      setResponse(r);
      dispatch({ type: 'reset', state: initReview(r) });
      setStatus('ready');
    } catch (e: any) {
      console.warn('[categorize] load failed:', e?.message || e);
      setStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const order = useMemo(() => response?.expenses.map((e) => e.id) ?? [], [response]);
  const groups = useMemo(() => deriveGroups(state, order), [state, order]);
  const plan = useMemo(() => buildApplyPlan(state, order), [state, order]);

  const apply = useCallback(async () => {
    // Defense in depth: the footer button is already disabled while `applying`,
    // but a caller invoking this twice back-to-back must not double-apply.
    if (!response || applying) return { categorized: 0, created: 0 };
    setApplying(true);
    try {
      const categoryStore = useCategoryStore.getState();
      return await applyCategorization(plan, response.expenses, {
        createCategory: (name) => {
          // A proposal named like a default category borrows its icon/colour;
          // anything else gets the neutral folder the review showed for it.
          const style = categoryStyle(name, i18n.t.bind(i18n));
          return categoryStore.createCategory(name, 'expense', style.icon, style.color);
        },
        bulkSetCategory: (ids, categoryId) =>
          useExpenseStore.getState().bulkUpdateExpenses(ids, { categoryId }, { awaitServer: true }),
        localExpenses: useExpenseStore.getState().expenses,
        existingCategoryIds: new Set(categoryStore.categories.map((c) => c.id)),
      });
    } finally {
      setApplying(false);
    }
  }, [plan, response, applying]);

  return { status, response, state, dispatch, groups, plan, apply, applying, retry: load };
}
