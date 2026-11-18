import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useExpenseStore } from '@/stores/expenseStore';
import { useMerchantRulesStore } from '@/stores/merchantRulesStore';
import type { MerchantCategoryRule, MerchantRuleReapplyPreview } from '@budget/shared-types';

/**
 * The "reapply this rule to past expenses" preview-and-confirm flow.
 * Split out of `MerchantsSettings.tsx` (`merchants-settings-screen-god-file`).
 */
export function useMerchantRuleReapply() {
  const { t } = useTranslation();
  const previewReapply = useMerchantRulesStore((s) => s.previewReapply);
  const reapplyRule = useMerchantRulesStore((s) => s.reapplyRule);

  const [preview, setPreview] = useState<MerchantRuleReapplyPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const closeReapply = useCallback(() => {
    setPreview(null);
    setSelected(new Set());
  }, []);

  const handleReapply = useCallback(async (rule: MerchantCategoryRule) => {
    setLoading(true);
    try {
      const p = await previewReapply(rule.id);
      if (p.totalCount === 0) {
        showAlert('', t('merchants.reapplyNothingToDo', { merchant: p.merchantNormalized }));
        return;
      }
      setPreview(p);
      setSelected(new Set(p.groups.map((g) => g.categoryId)));
    } finally {
      setLoading(false);
    }
  }, [previewReapply, t]);

  const toggleGroup = useCallback((categoryId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      return next;
    });
  }, []);

  const selectedCount = useMemo(() => {
    if (!preview) return 0;
    return preview.groups.reduce((sum, g) => sum + (selected.has(g.categoryId) ? g.count : 0), 0);
  }, [preview, selected]);

  const handleConfirmReapply = useCallback(async () => {
    if (!preview) return;
    setSaving(true);
    const targetCategoryName = preview.targetCategoryName;
    const updated = await reapplyRule(preview.ruleId, [...selected]);
    setSaving(false);
    closeReapply();
    // Fire-and-forget: this write happened server-side in one bulk update, not
    // through expenseStore's optimistic-local-then-push path, so nothing has
    // told the local store yet.
    useExpenseStore.getState().loadExpenses({ force: true });
    showAlert('', t('merchants.reapplyApplied', { count: updated, category: targetCategoryName }));
  }, [preview, selected, reapplyRule, closeReapply, t]);

  return {
    preview,
    selected,
    loading,
    saving,
    selectedCount,
    closeReapply,
    handleReapply,
    toggleGroup,
    handleConfirmReapply,
  };
}
