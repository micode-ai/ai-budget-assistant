import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency, ImportReportResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { trackAction } from '@/services/telemetry';
import { useAuthStore } from '@/stores/authStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { getIntlLocale } from '@/i18n';
import {
  resolveImportReportStatus,
  rollForwardRenewal,
  startOfMonth,
  type ImportReportStatus,
} from '@/features/import/importReport';

/**
 * The state and actions behind the post-import report (ABA-643, ABA-646): the load, the pick sets,
 * the one-tap apply and the `started` / `completed` telemetry. Extracted out of `ImportReportView`
 * so the phone and the desktop page read one definition; the phone maps `failed` and `insufficient`
 * to the screen it has always shown, so its behaviour does not change.
 *
 * `status` keeps a failed load apart from a successful "not enough data" answer
 * (`resolveImportReportStatus`). `retry` reloads after a failure.
 */
export function useImportReport(batchId: string) {
  const { t } = useTranslation();
  const intlLocale = getIntlLocale();
  const user = useAuthStore((s) => s.user);
  const categories = useCategoryStore((s) => s.categories);

  const [report, setReport] = useState<ImportReportResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'failed' | 'loaded'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [pickedSubs, setPickedSubs] = useState<Set<number>>(new Set());
  const [pickedBudgets, setPickedBudgets] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ budgets: number; subs: number } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getImportReport(batchId)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setLoadState('loaded');
        // Everything suggested starts checked — the one tap applies them all unless unchecked.
        setPickedSubs(new Set(r.subscriptions.map((_, i) => i)));
        setPickedBudgets(new Set(r.budgetSuggestions.map((b) => b.categoryId)));
        if (r.hasEnoughData && !startedRef.current) {
          startedRef.current = true;
          trackAction('import_report', 'started');
        }
      })
      .catch((e) => {
        console.warn('Failed to load import report', e);
        if (!cancelled) setLoadState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [batchId, attempt]);

  const retry = useCallback(() => {
    setLoadState('loading');
    setAttempt((a) => a + 1);
  }, []);

  const base = report?.baseCurrency ?? user?.currencyCode ?? 'USD';
  const money = useCallback((n: number, cur?: string) => formatCurrency(n, cur ?? base), [base]);

  // A category from an import carries the server id; after a pull the local store holds the same id.
  const categoryLabel = useCallback(
    (id: string | null, fallback: string) => {
      const local = id ? categories.find((c) => c.id === id || c.clientId === id) : undefined;
      if (local) return getCategoryDisplayName(local, t);
      return id ? fallback : t('common.uncategorized');
    },
    [categories, t],
  );

  const formatDay = useCallback(
    (day: string) =>
      new Date(`${day}T12:00:00`).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' }),
    [intlLocale],
  );

  const toggleSub = useCallback((index: number) => {
    setPickedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleBudget = useCallback((categoryId: string) => {
    setPickedBudgets((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const pickedCount = pickedSubs.size + pickedBudgets.size;

  const apply = useCallback(async () => {
    if (!report || pickedCount === 0) return;
    setApplying(true);
    const today = new Date();
    let budgets = 0;
    let subs = 0;
    for (const s of report.budgetSuggestions) {
      if (!pickedBudgets.has(s.categoryId)) continue;
      useBudgetStore.getState().addBudget({
        userId: user?.id || '',
        name: categoryLabel(s.categoryId, s.name),
        amount: s.monthlyAmount,
        currencyCode: base as Currency,
        period: 'monthly',
        startDate: startOfMonth(today),
        categoryAllocations: [
          {
            id: '',
            budgetId: '',
            categoryId: s.categoryId,
            amount: s.monthlyAmount,
            createdAt: today,
            updatedAt: today,
            isDeleted: false,
            syncVersion: 0,
          },
        ],
        alertThreshold: 80,
        isActive: true,
      });
      budgets++;
    }
    for (const [i, s] of report.subscriptions.entries()) {
      if (!pickedSubs.has(i)) continue;
      try {
        await useUserSubscriptionStore.getState().createSubscription({
          name: s.name,
          amount: s.amount,
          currencyCode: s.currencyCode,
          billingCycle: s.billingCycle,
          nextRenewalDate: rollForwardRenewal(s.nextRenewalDate, s.billingCycle, today),
          ...(s.categoryId ? { categoryId: s.categoryId } : {}),
          detectedFrom: s.name,
        });
        subs++;
      } catch (e) {
        console.warn('Failed to track subscription from import report', e);
      }
    }
    trackAction('import_report', 'completed');
    setApplied({ budgets, subs });
    setApplying(false);
  }, [report, pickedCount, pickedBudgets, pickedSubs, user?.id, base, categoryLabel]);

  const maxCategory = useMemo(() => Math.max(1, ...(report?.categories.map((c) => c.amount) ?? [1])), [report]);

  const status: ImportReportStatus = resolveImportReportStatus(loadState, report);

  return {
    status,
    report,
    retry,
    pickedSubs,
    pickedBudgets,
    toggleSub,
    toggleBudget,
    pickedCount,
    apply,
    applying,
    applied,
    // Display helpers both views share.
    money,
    categoryLabel,
    formatDay,
    maxCategory,
  };
}
