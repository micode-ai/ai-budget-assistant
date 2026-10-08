import { useCallback, useEffect, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useReceiptScanner, type ScannedReceipt } from '@/features/receipt/useReceiptScanner';
import { liveMembers } from '@/features/groups/groupDisplay';
import {
  buildShareInputs,
  initialSplitDraft,
  parseAmount,
  validateExpenseForm,
  type SplitDraft,
} from '@/features/groups/groupSplit';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInput';
import { showAlert } from '@/utils/alert';
import type { GroupDetail, GroupExpense, ShareType } from '@budget/shared-types';

/**
 * State and actions of the add / edit group expense form. The caller guarantees `detail` (and
 * `existing`, when editing) are already loaded, so initial state is seeded exactly once.
 *
 * Adding sends one stable `clientRequestId` per form instance, so a double tap or a retry after
 * a dropped response returns the row the server already made instead of a duplicate.
 */
export function useGroupExpenseForm(detail: GroupDetail, existing: GroupExpense | null) {
  const { t } = useTranslation();
  const addExpense = useGroupStore((s) => s.addExpense);
  const updateExpense = useGroupStore((s) => s.updateExpense);
  const deleteExpense = useGroupStore((s) => s.deleteExpense);
  const scanner = useReceiptScanner();

  const members = liveMembers(detail);
  const liveIds = members.map((m) => m.id);

  const [clientRequestId] = useState(() => randomUUID());
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amountText, setAmountText] = useState(existing ? String(existing.amount) : '');
  const [date, setDate] = useState<Date>(() =>
    existing ? (fromDateInputValue(existing.date, new Date()) ?? new Date()) : new Date(),
  );
  const [paidByMemberId, setPaidByMemberId] = useState<string | null>(() => {
    const payer = existing ? existing.paidByMemberId : detail.myMemberId;
    return liveIds.includes(payer) ? payer : null;
  });
  const [draft, setDraft] = useState<SplitDraft>(() => {
    const seed = initialSplitDraft(liveIds, existing);
    return { ...seed, selectedIds: seed.selectedIds.filter((id) => liveIds.includes(id)) };
  });
  const [submitting, setSubmitting] = useState(false);

  const amount = parseAmount(amountText);
  const validity = validateExpenseForm({ description, amount, paidByMemberId, draft });

  const setSplitType = useCallback((splitType: ShareType) => {
    setDraft((d) => (d.splitType === splitType ? d : { ...d, splitType, values: {} }));
  }, []);

  const toggleMember = useCallback((memberId: string) => {
    setDraft((d) => ({
      ...d,
      selectedIds: d.selectedIds.includes(memberId)
        ? d.selectedIds.filter((id) => id !== memberId)
        : liveIds.filter((id) => d.selectedIds.includes(id) || id === memberId),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIds.join('|')]);

  const setMemberValue = useCallback((memberId: string, value: string) => {
    setDraft((d) => ({ ...d, values: { ...d.values, [memberId]: value } }));
  }, []);

  // Scan failures arrive as scanner state; surface them once, then reset the scanner.
  useEffect(() => {
    if (!scanner.error) return;
    showAlert(t('errors.error'), t('groups.scanFailed'));
    scanner.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanner.error]);

  const applyReceipt = (receipt: ScannedReceipt) => {
    if (receipt.amount > 0) setAmountText(String(receipt.amount));
    const text = receipt.description || receipt.merchant;
    if (text) setDescription(text);
    if (receipt.date) {
      const parsed = fromDateInputValue(receipt.date.slice(0, 10), new Date());
      if (parsed) setDate(parsed);
    }
  };

  const scan = async (source: 'camera' | 'gallery') => {
    const receipt = source === 'camera' ? await scanner.pickFromCamera() : await scanner.pickFromGallery();
    if (receipt) {
      applyReceipt(receipt);
      void useSubscriptionStore.getState().loadUsage();
    }
  };

  /** Resolves true when the expense was saved. Errors are shown here. */
  const submit = async (): Promise<boolean> => {
    if (!validity.ok || !paidByMemberId || submitting) return false;
    setSubmitting(true);
    try {
      const body = {
        description: description.trim(),
        amount,
        date: toDateInputValue(date),
        paidByMemberId,
        splitType: draft.splitType,
        shares: buildShareInputs(draft),
      };
      if (existing) await updateExpense(detail.id, existing.id, body);
      else await addExpense(detail.id, body, clientRequestId);
      return true;
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (): Promise<boolean> => {
    if (!existing) return false;
    setSubmitting(true);
    try {
      await deleteExpense(detail.id, existing.id);
      return true;
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    members,
    isEditing: !!existing,
    description,
    setDescription,
    amountText,
    setAmountText,
    amount,
    date,
    setDate,
    paidByMemberId,
    setPaidByMemberId,
    draft,
    setSplitType,
    toggleMember,
    setMemberValue,
    validity,
    submitting,
    isScanning: scanner.isProcessing,
    scan,
    submit,
    remove,
  };
}
