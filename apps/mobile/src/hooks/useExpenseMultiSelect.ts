import { useState } from 'react';
import { showAlert } from '@/utils/alert';
import { useTranslation } from 'react-i18next';
import type { Expense } from '@budget/shared-types';

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
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const enterMultiSelect = (firstId: string) => {
    setIsMultiSelect(true);
    setSelectedIds(new Set([firstId]));
    setShowBulkCategoryPicker(false);
    setShowBulkTagPicker(false);
  };

  const exitMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setShowBulkCategoryPicker(false);
    setShowBulkTagPicker(false);
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
    isBulkProcessing,
    enterMultiSelect,
    exitMultiSelect,
    toggleSelection,
    selectAll,
    handleBulkSetCategory,
    handleBulkAddTags,
    handleBulkDelete,
  };
}
