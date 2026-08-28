import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { resolveProposedCategories } from '@/features/receipt/resolveProposedCategories';
import { compressAndEncodeImage } from '@/features/receipt/receiptImage';
import { captureCurrentLocation, type CapturedLocation } from '@/services/locationCapture';
import type { ScannedReceipt } from '@/features/receipt/useReceiptScanner';
import type { ReceiptCategorySplit } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

interface UseReceiptSaveParams {
  scannedReceipt: ScannedReceipt | null;
  merchant: string;
  saveImage: boolean;
  imageUri: string | null;
  isPdf: boolean;
  currentSplits: ReceiptCategorySplit[];
  itemCategories: Record<number, string | null>;
  proposedNamesToCreate: string[];
  /** Resets the whole scan (scanner state + split state + confirm UI). */
  onReset: () => void;
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
  currentSplits,
  itemCategories,
  proposedNamesToCreate,
  onReset,
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

      // Prepare receipt items
      const items = scannedReceipt.receiptItems?.map((item, index) => ({
        description: item.description,
        canonicalName: item.canonicalName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        sortOrder: index,
        categoryId: resolveKey(itemCategories[index]),
      }));

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

      showAlert(t('common.success'), t('receipt.success'), [
        { text: t('receipt.scanAnother'), style: 'cancel', onPress: onReset },
        { text: t('common.done'), onPress: () => router.back() },
      ]);
    } catch {
      showAlert(t('common.error'), t('receipt.saveFailed'));
    }
  };

  const handleEditExpense = () => {
    if (!scannedReceipt) return;

    let resolvedCategoryId = scannedReceipt.categoryId || '';
    if (!resolvedCategoryId && scannedReceipt.categorySuggestion) {
      const matched = useCategoryStore.getState().getCategoryByName(scannedReceipt.categorySuggestion, 'expense');
      resolvedCategoryId = matched?.id || '';
    }

    const params = {
      amount: scannedReceipt.amount.toString(),
      description: scannedReceipt.description,
      merchant: merchant.trim(),
      categoryId: resolvedCategoryId,
      currencyCode: scannedReceipt.currencyCode,
    };

    // Reset scan state so returning to this screen won't allow duplicate creation
    onReset();

    router.push({ pathname: '/expense/new', params });
  };

  return { handleConfirmExpense, handleEditExpense };
}
