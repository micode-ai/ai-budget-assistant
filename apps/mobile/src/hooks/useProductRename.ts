import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import type { ProductListItem } from '@budget/shared-types';

/**
 * Renaming — and, from the same sheet, ignoring — one tracked product.
 *
 * Split out of `ProductsSettings.tsx` (`products-settings-screen-regrowth`):
 * the ABA-478 split moved `RenameProductModal`'s JSX out of the screen but
 * left all of its state behind, which is exactly what made the file worth
 * splitting in the first place. This hook owns that state end to end —
 * `ProductsSettings` only wires the returned fields into `RenameProductModal`
 * and, for `openRename`/`handleResetAlias`, into its row renderer.
 */
export function useProductRename() {
  const { t } = useTranslation();
  const { upsertAlias, deleteAlias, ignoreProduct } = usePriceHistoryStore();

  const [editing, setEditing] = useState<ProductListItem | null>(null);
  const [renameName, setRenameName] = useState('');
  const [saving, setSaving] = useState(false);

  // `useCallback` with no deps, not a plain function: `ProductsSettings`'s
  // `renderItem` lists this in its own dep array, so while it was redefined
  // every render `renderItem`'s memo never held. Both setters are stable.
  const openRename = useCallback((item: ProductListItem) => {
    setEditing(item);
    setRenameName(item.canonicalName);
  }, []);

  const closeRename = useCallback(() => {
    setEditing(null);
    setRenameName('');
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!editing) return;
    const next = renameName.trim();
    if (!next || next === editing.canonicalName) { closeRename(); return; }
    setSaving(true);
    try { await upsertAlias(editing.rawName, next); } catch { /* warn'd */ }
    setSaving(false);
    closeRename();
  }, [editing, renameName, upsertAlias, closeRename]);

  const handleResetAlias = useCallback((item: ProductListItem) => {
    showAlert(
      t('priceHistory.resetAliasTitle'),
      t('priceHistory.resetAliasBody', { name: item.rawName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('priceHistory.resetAlias'),
          onPress: async () => {
            // Delete all aliases in this group (merged products share a canonicalName)
            try {
              await Promise.all(item.rawNames.map((rn) => deleteAlias(rn)));
            } catch { /* warn'd */ }
          },
        },
      ],
    );
  }, [deleteAlias, t]);

  const handleIgnore = useCallback((item: ProductListItem) => {
    showAlert(
      t('priceHistory.ignoreProduct'),
      t('priceHistory.ignoreConfirm', { name: item.canonicalName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('priceHistory.ignoreProduct'),
          style: 'destructive',
          onPress: async () => {
            closeRename();
            try {
              await Promise.all(item.rawNames.map((rn) => ignoreProduct(rn)));
            } catch { /* warn'd */ }
          },
        },
      ],
    );
  }, [ignoreProduct, t, closeRename]);

  return {
    editing,
    renameName,
    setRenameName,
    saving,
    openRename,
    closeRename,
    handleSaveRename,
    handleResetAlias,
    handleIgnore,
  };
}
