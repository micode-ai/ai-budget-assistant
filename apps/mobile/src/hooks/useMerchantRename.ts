import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useExpenseStore } from '@/stores/expenseStore';

/**
 * Renaming one merchant from the merchants screen's rename sheet.
 * Split out of `MerchantsSettings.tsx` (`merchants-settings-screen-god-file`),
 * mirroring `useProductRename`.
 */
export function useMerchantRename() {
  const { t } = useTranslation();
  const renameMerchant = useExpenseStore((s) => s.renameMerchant);

  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const openRename = useCallback((merchant: string) => {
    setEditing(merchant);
    setName(merchant);
  }, []);

  const closeRename = useCallback(() => {
    setEditing(null);
    setName('');
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!editing) return;
    const next = name.trim();
    if (!next) { showAlert(t('common.error'), t('merchants.nameRequired')); return; }
    if (next === editing) { closeRename(); return; }
    setSaving(true);
    const count = await renameMerchant(editing, next);
    setSaving(false);
    closeRename();
    showAlert('', t('merchants.renamed', { count }));
  }, [editing, name, renameMerchant, closeRename, t]);

  return { editing, name, setName, saving, openRename, closeRename, handleSaveRename };
}
