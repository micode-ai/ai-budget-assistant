import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { resolveProposedCategories } from '@/features/receipt/resolveProposedCategories';
import { buildReceiptPrefill } from '@/features/receipt/receiptPrefill';
import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';
import { compressAndEncodeImage } from '@/features/receipt/receiptImage';
import { captureCurrentLocation, type CapturedLocation } from '@/services/locationCapture';
import { maybeAskForReview } from '@/features/review/maybeAskForReview';
import type { ReceiptItem, ScannedReceipt } from '@/features/receipt/useReceiptScanner';
import type { ReceiptCategorySplit } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

interface UseReceiptSaveParams {
  scannedReceipt: ScannedReceipt | null;
  merchant: string;
  saveImage: boolean;
  imageUri: string | null;
  isPdf: boolean;
  /** The user's edited line items (ABA receipt-line-item-editing) — from
   * `useReceiptCategorySplit`'s `items`, NOT `scannedReceipt.receiptItems`,
   * which stays the untouched original OCR read. */
  items: ReceiptItem[];
  currentSplits: ReceiptCategorySplit[];
  itemCategories: Record<number, string | null>;
  proposedNamesToCreate: string[];
  /** Resets the whole scan (scanner state + split state + confirm UI). */
  onReset: () => void;
  /**
   * Called right after a successful save, before the result alert is shown.
   * Lets the screen track a batch-scanning session (ABA
   * batch-receipt-scan-session) without this hook owning any session state
   * itself — omit it and the alert is byte-identical to before.
   */
  onSaved?: () => { count: number; isCheckpoint: boolean };
  /**
   * How this flow finishes once the user picks "Done" on the success alert.
   * Defaults to `router.back()` — the routed screen's behaviour, unchanged.
   *
   * A host that is NOT a route must override it: on the desktop dashboard this
   * flow runs inside a dialog over a screen the user is already on, so
   * `router.back()` there would pop whatever route the dashboard itself sits
   * in and take them somewhere they never asked to go.
   */
  onDone?: () => void;
  /**
   * Where "Edit" hands the scan off for a full manual edit. Defaults to
   * `router.push('/expense/new', prefill)` — again the routed behaviour.
   *
   * The dialog host passes the same prefill to `ExpenseCreateForm`'s `initial`
   * prop instead, so the hand-off happens without leaving the dashboard. Both
   * destinations build the object from one place (`buildReceiptPrefill`), so
   * they cannot drift on what "Edit" carries over.
   */
  onEdit?: (prefill: ExpenseCreatePrefill) => void;
}

/**
 * Owns the two ways a scanned receipt leaves `app/expense/receipt.tsx`
 * (ABA-448): saved as an expense (`handleConfirmExpense`) or handed off to
 * the manual form for a bigger edit (`handleEditExpense`). Extracted out of
 * the screen with no change in behavior — the inline comments, carried over
 * verbatim, document invariants (proposed-category creation only on save,
 * GPS-vs-scanned-location precedence, resetting scan state before
 * navigating away) that are easy to break on a casual edit.
 */
export function useReceiptSave({
  scannedReceipt,
  merchant,
  saveImage,
  imageUri,
  isPdf,
  items: editedItems,
  currentSplits,
  itemCategories,
  proposedNamesToCreate,
  onReset,
  onSaved,
  onDone,
  onEdit,
}: UseReceiptSaveParams) {
  const { t } = useTranslation();
  const { addExpense } = useExpenseStore();
  const { user } = useAuthStore();

  const gpsLocationRef = useRef<CapturedLocation | null>(null);
  useEffect(() => {
    captureCurrentLocation().then((loc) => { gpsLocationRef.current = loc; });
  }, []);

  const handleConfirmExpense = async () => {
    if (!scannedReceipt) return;

    try {
      // Parse date if available
      // Use "T12:00:00" to parse as local time and avoid timezone date shift
      let expenseDate = new Date();
      if (scannedReceipt.date) {
        const parsedDate = new Date(scannedReceipt.date + 'T12:00:00');
        if (!isNaN(parsedDate.getTime())) {
          expenseDate = parsedDate;
        }
      }

      // Proposals become real categories only here — a scan the user abandons
      // must leave the account exactly as it found it. createCategory is
      // idempotent on (name, type) and offline-first.
      const resolveKey = await resolveProposedCategories(proposedNamesToCreate, (name) =>
        useCategoryStore.getState().createCategory(name, 'expense', '🏷️'),
      );

      // Prepare receipt items — from the user's edited list (ABA
      // receipt-line-item-editing), not the original OCR read. Sent as
      // `undefined` (not `[]`) when there are none, matching the prior
      // behavior of the optional-chained scannedReceipt.receiptItems read.
      const items = editedItems.length
        ? editedItems.map((item, index) => ({
            description: item.description,
            canonicalName: item.canonicalName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            sortOrder: index,
            categoryId: resolveKey(itemCategories[index]),
          }))
        : undefined;

      // Compress and encode receipt image if checkbox is checked (not for PDFs)
      let receiptImageBase64: string | undefined;
      if (saveImage && imageUri && !isPdf) {
        try {
          receiptImageBase64 = await compressAndEncodeImage(imageUri);
        } catch (e) {
          console.error('Failed to compress receipt image:', e);
        }
      }

      // Resolve category suggestion (name string) to a local category ID
      let resolvedCategoryId = scannedReceipt.categoryId || undefined;
      if (!resolvedCategoryId && scannedReceipt.categorySuggestion) {
        const matched = useCategoryStore.getState().getCategoryByName(scannedReceipt.categorySuggestion, 'expense');
        resolvedCategoryId = matched?.id;
      }

      await addExpense({
        userId: user?.id || '',
        amount: scannedReceipt.amount,
        discountAmount: scannedReceipt.discountAmount ?? undefined,
        depositAmount: scannedReceipt.depositAmount ?? undefined,
        currencyCode: scannedReceipt.currencyCode as Currency,
        description: scannedReceipt.description,
        merchant: merchant.trim() || undefined,
        categoryId: resolvedCategoryId,
        date: expenseDate,
        source: 'ocr',
        isRecurring: false,
        isDebt: false,
        isDebtRepayment: false,
        items,
        receiptImageBase64,
        location: scannedReceipt.location ?? gpsLocationRef.current ?? undefined,
        splits: currentSplits.length > 1
          ? currentSplits.map((s) => ({
              categoryId: resolveKey(s.categoryId) as string,
              amount: s.amount,
              percentage: s.percentage,
            }))
          : undefined,
      });

      // The rating ask rides on "Done", never on "Scan another": the user is
      // leaving satisfied, and interrupting a batch-scanning run with a system
      // sheet is exactly how a prompt earns a one-star answer. It throttles
      // itself, so calling it on every Done is safe (ABA-485).
      const finish = () => {
        if (onDone) onDone();
        else router.back();
        void maybeAskForReview();
      };

      // Auto-check off any shopping-list items this receipt's own lines
      // match (ABA shopping-list-receipt-reconciliation) — reads from the
      // items list the user actually confirmed/edited, not the raw OCR read.
      // No-ops (empty `checked`) when the toggle is off, nothing matched, or
      // the receipt carries no line items.
      const reconciliation = useShoppingListStore.getState().reconcileWithReceipt(
        items?.map((item) => ({ description: item.description, canonicalName: item.canonicalName })) ?? [],
      );
      const checkedIds = reconciliation.checked.map((c) => c.id);
      const undoButton = checkedIds.length > 0
        ? [{
            text: t('receipt.undoShoppingListCheck'),
            onPress: () => {
              useShoppingListStore.getState().undoReceiptReconciliation(checkedIds);
              finish();
            },
          }]
        : [];
      const checkedLine = checkedIds.length > 0
        ? '\n\n' + t('receipt.shoppingListChecked', { count: checkedIds.length })
        : '';

      const session = onSaved?.();
      if (session?.isCheckpoint) {
        showAlert(t('receipt.sessionCapTitle'), t('receipt.sessionCapBody', { count: session.count }) + checkedLine, [
          ...undoButton,
          { text: t('receipt.scanAnother'), style: 'cancel', onPress: onReset },
          { text: t('common.done'), onPress: finish },
        ]);
      } else {
        showAlert(t('common.success'), t('receipt.success') + checkedLine, [
          ...undoButton,
          { text: t('receipt.scanAnother'), style: 'cancel', onPress: onReset },
          { text: t('common.done'), onPress: finish },
        ]);
      }
    } catch {
      showAlert(t('common.error'), t('receipt.saveFailed'));
    }
  };

  const handleEditExpense = () => {
    if (!scannedReceipt) return;

    const params = buildReceiptPrefill({
      receipt: scannedReceipt,
      merchant,
      resolveCategoryByName: (name) =>
        useCategoryStore.getState().getCategoryByName(name, 'expense')?.id,
    });

    // Reset scan state so returning to this screen won't allow duplicate creation
    onReset();

    if (onEdit) onEdit(params);
    else router.push({ pathname: '/expense/new', params });
  };

  return { handleConfirmExpense, handleEditExpense };
}
