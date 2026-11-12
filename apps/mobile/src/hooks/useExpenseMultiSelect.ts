import { useState } from 'react';
import { showAlert } from '@/utils/alert';
import { useTranslation } from 'react-i18next';
import type { Expense } from '@budget/shared-types';
import type { AttributionMode } from '@budget/shared-utils';
import { useAccountStore } from '@/stores/accountStore';
import { useChildStore } from '@/stores/childStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { loadAttributionModes } from '@/features/children/attributionModes';
import { planBulkAssign } from '@/features/children/bulkAssign';

type BulkPatch = { categoryId?: string; tagIds?: string[]; isDeleted?: boolean };

export function useExpenseMultiSelect(
  expenses: Expense[],
  bulkUpdateExpenses: (ids: string[], patch: BulkPatch) => Promise<void>
) {
  const { t } = useTranslation();
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false);
  const [showBulkTagPicker, setShowBulkTagPicker] = useState(false);
  const [showBulkChildPicker, setShowBulkChildPicker] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const enterMultiSelect = (firstId: string) => {
    setIsMultiSelect(true);
    setSelectedIds(new Set([firstId]));
    setShowBulkCategoryPicker(false);
    setShowBulkTagPicker(false);
    setShowBulkChildPicker(false);
  };

  const exitMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setShowBulkCategoryPicker(false);
    setShowBulkTagPicker(false);
    setShowBulkChildPicker(false);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) setIsMultiSelect(false);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(expenses.map((e) => e.id)));
  };

  /**
   * Additive (desktop Task 6): replaces the selection with exactly the given
   * ids. Deliberately NOT `selectAll` — `selectAll` reads this hook's own
   * `expenses` list, which after the desktop facet rail (Task 4) is a
   * SUPERSET of whatever the rail currently leaves visible. Calling it from
   * a facet-filtered table would select rows the user cannot see and hand
   * them to a bulk delete. The desktop table calls this instead, with
   * exactly the visible, selectable ids it already knows about (a header
   * "select all" click, or a shift-click range) — mobile never calls this,
   * and `selectAll` is untouched for it.
   */
  const selectIds = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  const handleBulkSetCategory = async (categoryId: string) => {
    if (selectedIds.size === 0) return;
    setShowBulkCategoryPicker(false);
    setIsBulkProcessing(true);
    try {
      await bulkUpdateExpenses(Array.from(selectedIds), { categoryId });
      showAlert('', t('expenses.bulkCategoryApplied', { count: selectedIds.size }));
      exitMultiSelect();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkAddTags = async (tagIds: string[]) => {
    if (selectedIds.size === 0 || tagIds.length === 0) return;
    setShowBulkTagPicker(false);
    setIsBulkProcessing(true);
    try {
      await bulkUpdateExpenses(Array.from(selectedIds), { tagIds });
      showAlert('', t('expenses.bulkTagsApplied', { count: selectedIds.size }));
      exitMultiSelect();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /**
   * Child costs: attribute every selected expense, as a whole, to `childIds`.
   * An expense whose receipt lines are attributed is skipped, never replaced —
   * a bulk action cannot ask per row — and the skipped count is reported.
   * Sequential on purpose: on web each is one request, and a burst trips the
   * API proxy's rate limit.
   */
  const handleBulkAssignChildren = async (childIds: string[]) => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (selectedIds.size === 0 || childIds.length === 0 || !accountId) return;
    setShowBulkChildPicker(false);
    setIsBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      // The store's full list, not this hook's (possibly filtered) one: a row the
      // mode lookup cannot see would default to 'none' and lose its line attribution.
      const chosen = useExpenseStore.getState().expenses.filter((e) => selectedIds.has(e.id));
      let modes: Map<string, AttributionMode>;
      try {
        modes = await loadAttributionModes(chosen, accountId);
      } catch (e) {
        console.warn('[children] attribution modes not read:', e instanceof Error ? e.message : String(e));
        showAlert(t('common.error'), t('children.assignFailed'));
        return;
      }
      const plan = planBulkAssign(ids, (id) => modes.get(id) ?? 'none');
      const setExpenseChildren = useChildStore.getState().setExpenseChildren;
      let assigned = 0;
      let failed = 0;
      for (const id of plan.assign) {
        try {
          await setExpenseChildren(id, childIds);
          assigned += 1;
        } catch (e) {
          failed += 1;
          console.warn('[children] bulk attribution failed for one expense:', e instanceof Error ? e.message : String(e));
        }
      }
      const summary = t('children.bulkAssigned', { assigned, skipped: plan.skipped });
      showAlert('', failed > 0 ? `${summary}
${t('children.bulkAssignFailed', { count: failed })}` : summary);
      exitMultiSelect();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    showAlert(
      t('expenses.bulkDeleteConfirm', { count: selectedIds.size }),
      t('expenses.bulkDeleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('expenses.bulkDelete'),
          style: 'destructive',
          onPress: async () => {
            setIsBulkProcessing(true);
            try {
              await bulkUpdateExpenses(Array.from(selectedIds), { isDeleted: true });
              showAlert('', t('expenses.bulkDeleted', { count: selectedIds.size }));
              exitMultiSelect();
            } finally {
              setIsBulkProcessing(false);
            }
          },
        },
      ]
    );
  };

  return {
    isMultiSelect,
    selectedIds,
    showBulkCategoryPicker,
    setShowBulkCategoryPicker,
    showBulkTagPicker,
    setShowBulkTagPicker,
    showBulkChildPicker,
    setShowBulkChildPicker,
    isBulkProcessing,
    enterMultiSelect,
    exitMultiSelect,
    toggleSelection,
    selectAll,
    selectIds,
    handleBulkSetCategory,
    handleBulkAddTags,
    handleBulkAssignChildren,
    handleBulkDelete,
  };
}
