import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Expense } from '@budget/shared-types';
import { showAlert } from '@/utils/alert';
import { useChildStore } from '@/stores/childStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { attributionModeOf } from '@/features/children/attributionModes';
import { useAccountChildren } from './useAccountChildren';

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The "For" chip row's state on an expense form — the hook half of the
 * `ChildAttributionField` sub-form (hook + component, like the recurring, debt
 * and category-split sub-forms).
 *
 * Without an `expense` (the create form) it is plain selection state; the
 * caller attributes the new row after saving it (`attributeNewExpense`).
 *
 * With one (the edit form) it seeds from the expense's whole-expense links and
 * guards the mutual exclusivity with line attribution: the FIRST time a child
 * is picked on an expense whose receipt lines are attributed, the user is asked
 * "Replace the per-line attribution with the whole expense?" before the pick is
 * taken. Nothing is written until `save()` — and only when the user picked
 * chips in this edit session AND the result differs from the expense's links.
 *
 * Until the user touches a chip, `selected` follows the expense's CURRENT links:
 * a background pull, or a line attribution that cleared the links, must not
 * leave a stale copy that a later save of some other field writes back —
 * which would silently restore old links and wipe line attribution without
 * the confirmation.
 */
export function useExpenseChildSelection(expense?: Expense) {
  const { t } = useTranslation();
  const kids = useAccountChildren();

  const initial = useMemo(
    () => (expense?.expenseChildren ?? []).map((l) => l.childId),
    [expense?.expenseChildren],
  );
  const [selected, setSelected] = useState<string[]>(initial);
  /** True once picking children on this expense cannot replace line attribution (checked or confirmed). */
  const cleared = useRef(false);
  /** True once the user changed the chips in this session; until then `selected` mirrors `initial`. */
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) setSelected(initial);
  }, [initial]);

  const reset = useCallback(() => {
    setSelected(initial);
    cleared.current = false;
    touched.current = false;
  }, [initial]);

  const take = useCallback((ids: string[]) => {
    touched.current = true;
    setSelected(ids);
  }, []);

  const onChange = useCallback(
    async (ids: string[]) => {
      if (!expense || ids.length === 0 || cleared.current) {
        take(ids);
        return;
      }
      let hasLines = false;
      try {
        const items = await useExpenseStore.getState().loadExpenseItems(expense.id);
        hasLines = attributionModeOf(expense, items) === 'lines';
      } catch (e) {
        console.warn('[children] could not read receipt lines:', e instanceof Error ? e.message : String(e));
      }
      if (!hasLines) {
        cleared.current = true;
        take(ids);
        return;
      }
      showAlert(t('children.replaceLinesTitle'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('children.replaceLinesConfirm'),
          style: 'destructive',
          onPress: () => {
            cleared.current = true;
            take(ids);
          },
        },
      ]);
    },
    [expense, t, take],
  );

  const isDirty = touched.current && !sameSet(selected, initial);

  /** Writes the selection when it changed. Never throws: a failure is reported and logged. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!expense || !touched.current || sameSet(selected, initial)) return true;
    try {
      await useChildStore.getState().setExpenseChildren(expense.id, selected);
      return true;
    } catch (e) {
      console.warn('[children] attribution not saved:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('children.assignFailed'));
      return false;
    }
  }, [expense, selected, initial, t]);

  return { kids, selected, onChange, reset, save, isDirty };
}

export type ExpenseChildSelection = ReturnType<typeof useExpenseChildSelection>;
