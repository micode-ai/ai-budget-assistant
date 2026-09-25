import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';

/**
 * Merging several tracked products, chosen via multi-select, into one.
 *
 * Split out of `ProductsSettings.tsx` (`products-settings-screen-regrowth`):
 * the ABA-478 split moved `MergeProductsModal`'s JSX out of the screen but
 * left all of its state behind, which is exactly what made the file worth
 * splitting in the first place. `selected` and `exitSelect` still come from
 * the sibling `useProductMultiSelect` hook the screen owns — this hook only
 * owns the merge SHEET's own state (source set, target name, in-flight
 * flag), the same boundary `useProductMultiSelect` already draws around "is
 * a row checked".
 */
export function useProductMerge(selected: Set<string>, exitSelect: () => void) {
  const { t } = useTranslation();
  const { products, mergeProducts } = usePriceHistoryStore();

  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultMergeName = (sources: string[]) => {
    const byCount = new Map(products.map((p) => [p.rawName, p.purchaseCount]));
    return [...sources].sort((a, b) => (byCount.get(b) ?? 0) - (byCount.get(a) ?? 0))[0] ?? '';
  };

  const openMerge = () => {
    const sources = [...selected];
    if (sources.length < 2) return;
    setMergeSources(sources);
    setMergeName(defaultMergeName(sources));
  };

  const closeMerge = () => { setMergeSources(null); setMergeName(''); };

  const mergeLabel = useMemo(
    () =>
      mergeSources
        ?.map((s) => products.find((x) => x.rawName === s)?.canonicalName ?? s)
        .join(' + ') ?? '',
    [mergeSources, products],
  );

  const handleConfirmMerge = async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) return;
    // Expand each selected primary rawName to all rawNames in its group
    const allRawNames = mergeSources.flatMap(
      (primaryRaw) => products.find((p) => p.rawName === primaryRaw)?.rawNames ?? [primaryRaw],
    );
    setSaving(true);
    try { await mergeProducts(allRawNames, target); } catch { /* warn'd */ }
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('priceHistory.merged'));
  };

  return {
    mergeSources,
    mergeName,
    setMergeName,
    saving,
    mergeLabel,
    openMerge,
    closeMerge,
    handleConfirmMerge,
  };
}
