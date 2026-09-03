import { useState } from 'react';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import type { AccountTransfer, Currency } from '@budget/shared-types';
import { useTranslation } from 'react-i18next';

/**
 * Owns all edit-mode state, account/currency resolution, and save/cancel/delete
 * logic for the transfer-detail screen (`app/wallet/[id].tsx`). Mirrors
 * `useTransferForm` (the create-screen counterpart, ABA-469) — the screen owns
 * only the JSX/theme concerns and the read-only (non-editing) render.
 */
export function useTransferEditForm(transfer: AccountTransfer) {
  const { t } = useTranslation();
  const updateTransfer = useWalletStore((s) => s.updateTransfer);
  const deleteTransfer = useWalletStore((s) => s.deleteTransfer);
  const accounts = useAccountStore((s) => s.accounts);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fromAccountId, setFromAccountId] = useState(transfer.fromAccountId);
  const [toAccountId, setToAccountId] = useState(transfer.toAccountId);
  const [fromAmount, setFromAmount] = useState(transfer.fromAmount.toString());
  const [toAmount, setToAmount] = useState(transfer.toAmount.toString());
  const [exchangeRate, setExchangeRate] = useState(transfer.exchangeRate.toString());
  const [notes, setNotes] = useState(transfer.notes || '');
  const [countAsIncome, setCountAsIncome] = useState(transfer.countAsIncome);
  const [date, setDate] = useState(new Date(transfer.date));
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Accounts the user may pay from. A viewer cannot be the source of a transfer,
  // which the server enforces too.
  const payableAccounts = accounts.filter((a) => a.myRole !== 'viewer');
  const otherAccounts = accounts.filter((a) => a.id !== fromAccountId);

  // Currency follows the account, exactly as it does in the create form. A pure
  // derivation rather than its own state — the edit-mode account cards never show
  // a separate currency chip, so there is nothing for a setter to drive; re-homing
  // a transfer while keeping the old currency would store a meaningless row.
  const currencyOf = (accountId: string, fallback: Currency): Currency =>
    (accounts.find((a) => a.id === accountId)?.currencyCode as Currency) ?? fallback;
  const fromCurrency =
    fromAccountId === transfer.fromAccountId
      ? transfer.fromCurrency
      : currencyOf(fromAccountId, transfer.fromCurrency);
  const toCurrency =
    toAccountId === transfer.toAccountId
      ? transfer.toCurrency
      : currencyOf(toAccountId, transfer.toCurrency);

  const onFromAmountChange = (value: string) => {
    setFromAmount(value);
    const rate = parseAmount(exchangeRate);
    if (value && rate) {
      setToAmount((parseAmount(value) * rate).toFixed(2));
    }
  };

  const onToAmountChange = (value: string) => {
    setToAmount(value);
    const rate = parseAmount(exchangeRate);
    if (value && rate) {
      setFromAmount((parseAmount(value) / rate).toFixed(2));
    }
  };

  const onRateChange = (value: string) => {
    setExchangeRate(value);
    if (fromAmount && value) {
      setToAmount((parseAmount(fromAmount) * parseAmount(value)).toFixed(2));
    }
  };

  const reset = () => {
    setFromAccountId(transfer.fromAccountId);
    setToAccountId(transfer.toAccountId);
    setFromAmount(transfer.fromAmount.toString());
    setToAmount(transfer.toAmount.toString());
    setExchangeRate(transfer.exchangeRate.toString());
    setNotes(transfer.notes || '');
    setCountAsIncome(transfer.countAsIncome);
    setDate(new Date(transfer.date));
    setShowDatePicker(false);
  };

  const startEditing = () => {
    reset();
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    reset();
  };

  const handleSave = async () => {
    const from = parseAmount(fromAmount);
    const to = parseAmount(toAmount);
    const rate = parseAmount(exchangeRate);

    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      showAlert(t('common.error'), t('transfer.sameAccountError'));
      return;
    }

    if (!from || !to || !rate || from <= 0 || to <= 0 || rate <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    setIsSaving(true);
    const result = await updateTransfer(transfer.id, {
      fromAccountId,
      toAccountId,
      fromCurrency,
      toCurrency,
      fromAmount: from,
      toAmount: to,
      exchangeRate: rate,
      date,
      notes: notes.trim() || undefined,
      countAsIncome,
    });
    setIsSaving(false);

    // Only a server refusal is an error worth interrupting for: it is rolled back
    // and will never sync, so say so and stay in edit mode. An offline save comes
    // back as `queued` — the edit is kept and retried, exactly like every other
    // offline write in the app, so it closes silently.
    if (result.status === 'rejected') {
      showAlert(t('transfer.saveFailed'), t('transfer.saveFailedHint'));
      return;
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    showAlert(t('transfer.deleteTitle'), t('transfer.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteTransfer(transfer.id);
          router.back();
        },
      },
    ]);
  };

  return {
    isEditing,
    isSaving,
    // account/currency/amount state
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    fromCurrency,
    toCurrency,
    fromAmount,
    onFromAmountChange,
    toAmount,
    onToAmountChange,
    exchangeRate,
    onRateChange,
    // notes/income/date
    notes,
    setNotes,
    countAsIncome,
    setCountAsIncome,
    date,
    setDate,
    showDatePicker,
    setShowDatePicker,
    // derived
    payableAccounts,
    otherAccounts,
    // actions
    startEditing,
    cancelEditing,
    handleSave,
    handleDelete,
  };
}

export type UseTransferEditFormReturn = ReturnType<typeof useTransferEditForm>;
