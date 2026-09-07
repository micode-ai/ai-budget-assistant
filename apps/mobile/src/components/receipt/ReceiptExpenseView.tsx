import { useEffect, useRef, useState } from 'react';
import { showAlert } from '@/utils/alert';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useTranslation } from 'react-i18next';
import { useReceiptScanner } from '@/features/receipt/useReceiptScanner';
import { isReceiptSessionCheckpoint } from '@/features/receipt/receiptScanSession';
import { useReceiptCategorySplit } from '@/hooks/useReceiptCategorySplit';
import { useReceiptSave } from '@/hooks/useReceiptSave';
import { useReceiptScanSession } from '@/hooks/useReceiptScanSession';
import { useExpenseStore } from '@/stores/expenseStore';
import { resolveExistingMerchant } from '@/utils/merchant';
import ReceiptCaptureView from '@/components/receipt/ReceiptCaptureView';
import ReceiptConfirmCard from '@/components/receipt/ReceiptConfirmCard';
import ItemCategorySheet from '@/components/receipt/ItemCategorySheet';
import { useCategoryStore } from '@/stores/categoryStore';
import { useStyles, type Theme } from '@/theme';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { trackAction } from '@/services/telemetry';
import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';

interface ReceiptExpenseViewProps {
  /**
   * Called when the user is finished with this view — from the success alert's
   * "Done" button, where the route calls `router.back()`. "Scan another"
   * deliberately does NOT call it: that path stays mounted and resets for the
   * next receipt, which is what makes this a batch-scanning session (see
   * `useReceiptScanSession`).
   */
  onDone: () => void;
  /**
   * "Edit" on the confirm card — the scan is close but the user wants the full
   * manual form. Omitted by the route, which keeps the default
   * `router.push('/expense/new', prefill)`; supplied by a dialog host, which
   * hands the same prefill straight to `ExpenseCreateForm` instead of
   * navigating off the screen the dialog is sitting on.
   */
  onEdit?: (prefill: ExpenseCreatePrefill) => void;
  /**
   * Reports whether a completed scan is sitting here unsaved, so a host that
   * can be dismissed by a stray click (Esc, a scrim) can ask before throwing
   * it away. Omitted by the route — the phone's header X has never confirmed,
   * and this must not change that.
   *
   * **Deliberately just `showConfirm`**, not "anything is happening". A scan
   * awaiting confirmation is work the user can SEE and that cost a real AI
   * request to produce; an in-flight scan or a spinner is neither, and
   * guarding those would put a confirmation in front of an ordinary cancel.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The receipt-scan body, extracted verbatim from `app/expense/receipt.tsx` so
 * something other than a route can host it — nothing under `src/` may import
 * from `app/` (`@/*` maps to `./src/*` only), so a desktop dialog had nothing
 * to render. Same move, and the same `router.back()` -> `onDone()` shape, as
 * `VoiceExpenseView`/`ExpenseCreateForm`/`IncomeCreateForm`.
 *
 * **The header is NOT here, and that is the trap this file exists to name.**
 * Unlike every other screen in this family, `expense/receipt`'s `Stack.Screen`
 * in `app/_layout.tsx` sets `headerShown: false` — the screen draws its own
 * header row inside the route file instead: a close button, the
 * `receipt.title` heading, and an `AiUsageBadge`. That badge is the only place
 * this AI-cost-bearing flow tells the user how much quota is left. A host that
 * is not the route MUST supply all three itself; an implementer who checks
 * `_layout.tsx` alone will find a `title` that is never rendered and no badge
 * at all. The route keeps drawing its own, unchanged.
 */
export function ReceiptExpenseView({ onDone, onEdit, onDirtyChange }: ReceiptExpenseViewProps) {
  useEffect(() => {
    trackAction('expense_receipt', 'started');
  }, []);
  /**
   * `started` is emitted once per MOUNT, and this screen is a batch-scan session
   * BY DESIGN — the success alert offers "Scan another" without navigating away
   * (see `useReceiptScanSession`). A ten-receipt session therefore reported 1
   * started against 10 completed, which put per-flow completion over 100% and
   * pinned `abandoned` (derived as started - completed - failed) at 0, killing
   * the one signal this feature exists to produce. So `completed` is once per
   * mount too: the session reads as one completed VISIT rather than ten saves.
   * That is the intended trade — this measures abandonment, not volume, and
   * `screens`/`lastScreens` already carry visit intensity. `sessionCount` (the
   * user-facing pill) is unaffected and still counts every save.
   * `failed` below is deliberately NOT deduplicated: repeated scan failures in
   * one visit are a genuine error-rate signal.
   */
  const completedRef = useRef(false);

  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveImage, setSaveImage] = useState(true);
  const [userPrompt, setUserPrompt] = useState('');
  const [merchant, setMerchant] = useState('');
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
  const { getExpenseCategories } = useCategoryStore();

  const {
    isProcessing,
    error,
    imageUri,
    isPdf,
    scannedReceipt,
    pickFromCamera,
    pickFromGallery,
    pickPdfDocument,
    reset,
  } = useReceiptScanner();

  /**
   * Report the unsaved-scan state outward. An effect rather than a call beside
   * each `setShowConfirm`, so every route into and out of the confirm state
   * (scan lands, save, reset, "scan another") is covered by construction. A
   * host that passes nothing gets an `undefined?.()` no-op, so the routed
   * screen is untouched.
   */
  useEffect(() => {
    onDirtyChange?.(showConfirm);
  }, [showConfirm, onDirtyChange]);

  useEffect(() => {
    if (error) {
      // `failed` covers only this scan-error branch. A SAVE failure inside
      // `useReceiptSave.handleConfirmExpense`'s own `catch` reports neither
      // `completed` nor `failed`, so it lands in the admin funnel's derived
      // `abandoned` bucket — this flow's abandoned count over-represents true
      // save failures relative to the other flows.
      trackAction('expense_receipt', 'failed');
      showAlert(t('common.error'), error, [{ text: 'OK', onPress: reset }]);
    }
  }, [error, reset, t]);

  useEffect(() => {
    if (scannedReceipt) {
      setShowConfirm(true);
      setMerchant(resolveExistingMerchant(scannedReceipt.merchant, getDistinctMerchants()));
      useSubscriptionStore.getState().loadUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedReceipt]);

  const {
    itemCategories,
    items,
    splitDropped,
    currentSplits,
    proposedNamesInPlay,
    proposedNamesToCreate,
    sheetItems,
    showSplitSheet,
    setShowSplitSheet,
    handleItemCategoryChange,
    handleItemFieldChange,
    handleAddItem,
    handleRemoveItem,
    resetSplitState,
  } = useReceiptCategorySplit(scannedReceipt);

  const handleReset = () => {
    reset();
    setShowConfirm(false);
    setSaveImage(false);
    resetSplitState();
  };

  const { count: sessionCount, recordSaved } = useReceiptScanSession();

  const { handleConfirmExpense, handleEditExpense } = useReceiptSave({
    scannedReceipt,
    merchant,
    saveImage,
    imageUri,
    isPdf,
    items,
    currentSplits,
    itemCategories,
    proposedNamesToCreate,
    onReset: handleReset,
    onDone,
    onEdit,
    onSaved: () => {
      if (!completedRef.current) {
        completedRef.current = true;
        trackAction('expense_receipt', 'completed');
      }
      const count = recordSaved();
      return { count, isCheckpoint: isReceiptSessionCheckpoint(count) };
    },
  });

  const handleCameraPress = async () => {
    await pickFromCamera(userPrompt.trim() || undefined);
  };

  const handleGalleryPress = async () => {
    await pickFromGallery(userPrompt.trim() || undefined);
  };

  const handlePdfPress = async () => {
    await pickPdfDocument(userPrompt.trim() || undefined);
  };

  return (
    <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
      {!showConfirm ? (
        <ReceiptCaptureView
          isProcessing={isProcessing}
          imageUri={imageUri}
          isPdf={isPdf}
          userPrompt={userPrompt}
          onUserPromptChange={setUserPrompt}
          onCameraPress={handleCameraPress}
          onGalleryPress={handleGalleryPress}
          onPdfPress={handlePdfPress}
          sessionCount={sessionCount}
        />
      ) : (
        <>
          <ReceiptConfirmCard
            scannedReceipt={scannedReceipt}
            imageUri={imageUri}
            isPdf={isPdf}
            merchant={merchant}
            onMerchantChange={setMerchant}
            items={items}
            onEditItem={handleItemFieldChange}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            currentSplits={currentSplits}
            splitDropped={splitDropped}
            sheetItemsLength={sheetItems.length}
            onOpenSplitSheet={() => setShowSplitSheet(true)}
            saveImage={saveImage}
            onToggleSaveImage={() => setSaveImage(!saveImage)}
            onEdit={handleEditExpense}
            onConfirm={handleConfirmExpense}
            onRetry={handleReset}
          />

          <ItemCategorySheet
            visible={showSplitSheet}
            items={sheetItems}
            categories={getExpenseCategories()}
            proposedNames={proposedNamesInPlay}
            onChange={handleItemCategoryChange}
            onClose={() => setShowSplitSheet(false)}
          />
        </>
      )}
    </KeyboardAwareScreen>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[6],
    alignItems: 'center' as const,
  },
});
