import { useCallback, useEffect, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useReceiptScanner, type ScannedReceipt } from '@/features/receipt/useReceiptScanner';
import { liveMembers } from '@/features/groups/groupDisplay';
import {
  buildShareInputs,
  initialSplitDraft,
  parseAmount,
  validateExpenseForm,
  type ExpenseFormValidity,
  type SplitDraft,
} from '@/features/groups/groupSplit';
import {
  buildFxBody,
  convertedPreview,
  entryCurrencies,
  fxIssue,
  initialFxState,
  isFxRateUnavailable,
  parseRate,
} from '@/features/groups/groupFx';
import {
  buildDiscountValue,
  buildItemInputs,
  draftsFromView,
  isItemsInvalid,
  linesFromScan,
  linesTotal,
  validateItemizedForm,
  type ItemLineDraft,
  type ItemsIssue,
} from '@/features/groups/groupItems';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInput';
import { showAlert } from '@/utils/alert';
import type { GroupDetail, GroupExpense, GroupExpenseItemsView, ShareType } from '@budget/shared-types';

/**
 * State and actions of the add / edit group expense form. The caller guarantees `detail` (and
 * `existing`, when editing) are already loaded, so initial state is seeded exactly once.
 *
 * Adding sends one stable `clientRequestId` per form instance, so a double tap or a retry after
 * a dropped response returns the row the server already made instead of a duplicate.
 */
export function useGroupExpenseForm(
  detail: GroupDetail,
  existing: GroupExpense | null,
  /** ABA-656: an edited ITEMISED expense's stored lines (the caller loads them first). */
  existingItems: GroupExpenseItemsView | null = null,
) {
  const { t } = useTranslation();
  const addExpense = useGroupStore((s) => s.addExpense);
  const updateExpense = useGroupStore((s) => s.updateExpense);
  const deleteExpense = useGroupStore((s) => s.deleteExpense);
  const scanner = useReceiptScanner();

  const members = liveMembers(detail);
  const liveIds = members.map((m) => m.id);

  const groupCurrency = detail.currencyCode;
  // ABA-654: the amount is typed in the ENTRY currency; an edited foreign expense restores what it
  // was entered with (original amount, currency and the stored rate), never the converted figure.
  const [fxSeed] = useState(() => initialFxState(existing, groupCurrency));
  const [clientRequestId] = useState(() => randomUUID());
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amountText, setAmountText] = useState(fxSeed.entryAmountText);
  const [currency, setCurrencyState] = useState(fxSeed.currency);
  const [rateText, setRateTextState] = useState(fxSeed.rateText);
  /** True once the user typed a rate: only then is it sent as a manual override. */
  const [rateEdited, setRateEdited] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  /** The provider had no rate for this currency (the user must type one). */
  const [rateUnavailable, setRateUnavailable] = useState(false);
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
  // ABA-656: itemised mode. Chosen only on a new expense; an edit keeps the expense's own kind
  // (the server refuses items on a plain expense and a split on an itemised one).
  const [itemized, setItemizedState] = useState<boolean>(() => !!existing?.itemized);
  const [lines, setLines] = useState<ItemLineDraft[]>(() => (existingItems ? draftsFromView(existingItems.items) : []));
  const [discountText, setDiscountText] = useState<string>(() =>
    existingItems?.discountAmount ? String(existingItems.discountAmount) : '',
  );
  /** The last scan's lines, kept so switching to itemised after a scan prefills them. */
  const [scanned, setScanned] = useState<{ lines: ItemLineDraft[]; discountText: string } | null>(null);

  const amount = parseAmount(amountText);
  const isForeign = currency !== groupCurrency;
  const rate = isForeign ? parseRate(rateText) : 1;
  const baseValidity: { ok: boolean; issue: ExpenseFormValidity['issue'] | ItemsIssue | null } = itemized
    ? validateItemizedForm({ description, amount, paidByMemberId, lines, discountText })
    : validateExpenseForm({ description, amount, paidByMemberId, draft });
  const rateProblem = baseValidity.ok ? fxIssue(currency, groupCurrency, rateText) : null;
  const validity: { ok: boolean; issue: ExpenseFormValidity['issue'] | ItemsIssue | 'rate' | null } = rateProblem
    ? { ok: false, issue: rateProblem }
    : baseValidity;

  // Fetch the provider rate when a foreign currency is picked, unless it is the stored currency of the
  // expense being edited (its stored rate is what an edit reuses). A late answer for a currency the
  // user has since moved away from is dropped.
  const [rateRequest, setRateRequest] = useState(0);
  useEffect(() => {
    if (!isForeign || (existing && existing.originalCurrency === currency && fxSeed.rateText)) return;
    if (rateEdited) return;
    let alive = true;
    setRateLoading(true);
    setRateUnavailable(false);
    api
      .getGroupFxPreview(detail.id, currency)
      .then((p) => {
        if (!alive) return;
        if (p.rate === null) {
          setRateUnavailable(true);
          setRateTextState('');
        } else setRateTextState(String(p.rate));
      })
      .catch((e) => {
        console.warn('[useGroupExpenseForm] fx preview failed:', e instanceof Error ? e.message : e);
        if (alive) {
          setRateUnavailable(true);
          setRateTextState('');
        }
      })
      .finally(() => {
        if (alive) setRateLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, rateRequest]);

  const setCurrency = useCallback(
    (next: string) => {
      setCurrencyState(next);
      setRateEdited(false);
      setRateUnavailable(false);
      if (existing && existing.originalCurrency === next && fxSeed.rateText) setRateTextState(fxSeed.rateText);
      else setRateTextState('');
      setRateRequest((n) => n + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing?.id],
  );

  const setRateText = useCallback((text: string) => {
    setRateTextState(text);
    setRateEdited(true);
  }, []);

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

  const setItemized = useCallback(
    (next: boolean) => {
      if (existing) return;
      setItemizedState(next);
      // Switching on after a scan: the scanned lines, unless the user already typed some.
      if (next && scanned && lines.length === 0) {
        setLines(scanned.lines);
        setDiscountText(scanned.discountText);
      }
    },
    [existing, scanned, lines.length],
  );

  const addLine = useCallback(() => {
    setLines((ls) => [...ls, { key: randomUUID(), name: '', priceText: '', discountText: '' }]);
  }, []);
  const updateLine = useCallback((key: string, patch: Partial<Omit<ItemLineDraft, 'key' | 'id'>>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);
  const removeLine = useCallback((key: string) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }, []);

  const applyReceipt = (receipt: ScannedReceipt) => {
    // ABA-656: the receipt's lines. Filled straight in when itemised, otherwise kept for the toggle.
    const fromScan = linesFromScan(receipt.receiptItems ?? [], receipt.discountAmount, () => randomUUID());
    if (fromScan.lines.length > 0) {
      setScanned(fromScan);
      if (itemized) {
        setLines(fromScan.lines);
        setDiscountText(fromScan.discountText);
      }
    }
    if (receipt.amount > 0) setAmountText(String(receipt.amount));
    // ABA-654: the receipt's own currency, when the group accepts it (the chip shows it either way).
    if (receipt.currencyCode && receipt.currencyCode !== currency && entryCurrencies(groupCurrency).includes(receipt.currencyCode)) {
      setCurrency(receipt.currencyCode);
    }
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
      const common = {
        description: description.trim(),
        amount,
        date: toDateInputValue(date),
        paidByMemberId,
        ...buildFxBody({ currency, groupCurrency, rateText, rateEdited }),
      };
      if (itemized) {
        // ABA-656: lines instead of a split; the server resolves the shares from the claims.
        const discount = buildDiscountValue(discountText, !!existing);
        const items = buildItemInputs(lines);
        if (existing) await updateExpense(detail.id, existing.id, { ...common, items, discountAmount: discount });
        else {
          await addExpense(
            detail.id,
            { ...common, items, ...(typeof discount === 'number' ? { discountAmount: discount } : {}) },
            clientRequestId,
          );
        }
        return true;
      }
      const body = { ...common, splitType: draft.splitType, shares: buildShareInputs(draft) };
      if (existing) await updateExpense(detail.id, existing.id, body);
      else await addExpense(detail.id, body, clientRequestId);
      return true;
    } catch (e) {
      if (isItemsInvalid(e)) {
        showAlert(t('errors.error'), t('groups.itemsInvalid'));
        return false;
      }
      if (isFxRateUnavailable(e)) {
        setRateUnavailable(true);
        showAlert(t('errors.error'), t('groups.fxRateUnavailable'));
        return false;
      }
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
    // ABA-654
    groupCurrency,
    currencies: entryCurrencies(groupCurrency),
    currency,
    setCurrency,
    isForeign,
    rateText,
    setRateText,
    rateLoading,
    rateUnavailable,
    convertedAmount: isForeign ? convertedPreview(amount, rate) : amount,
    date,
    setDate,
    paidByMemberId,
    setPaidByMemberId,
    draft,
    setSplitType,
    toggleMember,
    setMemberValue,
    validity,
    // ABA-656
    itemized,
    setItemized,
    canChooseItemized: !existing,
    lines,
    addLine,
    updateLine,
    removeLine,
    discountText,
    setDiscountText,
    linesTotal: linesTotal(lines, discountText),
    submitting,
    isScanning: scanner.isProcessing,
    scan,
    submit,
    remove,
  };
}
