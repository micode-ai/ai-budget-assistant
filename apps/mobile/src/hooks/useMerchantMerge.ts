import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useExpenseStore } from '@/stores/expenseStore';

interface Params {
  /** Merchants ticked in the screen's multi-select mode. */
  selected: Set<string>;
  /** Leaves multi-select mode; called after a successful merge. */
  exitSelect: () => void;
  countByMerchant: Map<string, number>;
}

/**
 * Merging merchants, from a multi-select or from a suggestion banner.
 * Split out of `MerchantsSettings.tsx` (`merchants-settings-screen-god-file`),
 * mirroring `useProductMerge`.
 */
export function useMerchantMerge({ selected, exitSelect, countByMerchant }: Params) {
  const { t } = useTranslation();
  const mergeMerchants = useExpenseStore((s) => s.mergeMerchants);

  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');
  const [saving, setSaving] = useState(false);

  const openMergeFromSelection = useCallback(() => {
    const sources = [...selected];
    if (sources.length < 2) { showAlert('', t('merchants.selectToMerge')); return; }
    // Default canonical = highest-count name among the sources
    const canonical =
      [...sources].sort((a, b) => (countByMerchant.get(b) ?? 0) - (countByMerchant.get(a) ?? 0))[0] ?? '';
    setMergeSources(sources);
    setMergeName(canonical);
  }, [selected, countByMerchant, t]);

  const openMergeFromSuggestion = useCallback((members: string[], canonical: string) => {
    setMergeSources(members);
    setMergeName(canonical);
  }, []);

  const closeMerge = useCallback(() => {
    setMergeSources(null);
    setMergeName('');
  }, []);

  const mergeExpenseCount = useMemo(
    () => (mergeSources ?? []).reduce((s, m) => s + (countByMerchant.get(m) ?? 0), 0),
    [mergeSources, countByMerchant],
  );

  const handleConfirmMerge = useCallback(async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) { showAlert(t('common.error'), t('merchants.nameRequired')); return; }
    setSaving(true);
    const count = await mergeMerchants(mergeSources, target);
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('merchants.merged', { name: target, count }));
  }, [mergeSources, mergeName, mergeMerchants, closeMerge, exitSelect, t]);

  return {
    mergeSources,
    mergeName,
    setMergeName,
    saving,
    mergeExpenseCount,
    openMergeFromSelection,
    openMergeFromSuggestion,
    closeMerge,
    handleConfirmMerge,
  };
}
