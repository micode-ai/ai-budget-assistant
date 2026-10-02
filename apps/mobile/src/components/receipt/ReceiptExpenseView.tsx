import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { getIntlLocale } from '@/i18n';
import { bankCopySource, defaultMergeWithBank, describeDuplicateMatch } from '@/features/receipt/receiptDuplicate';
import type { ReceiptDuplicateMatch } from '@budget/shared-types';
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
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { current, remaining } from '@/features/share-intake/shareIntakeQueue';
import { deleteSharedFile } from '@/services/shareIntake';

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
  /**
   * Opens a saved expense this scan duplicates (ABA-603). Omitted by the
   * route, which pushes `/expense/[id]`; a dialog host closes itself first so
   * the expense is not opened underneath it.
   */
  onOpenExpense?: (expenseId: string) => void;
  /**
   * Share-to-capture (`expense/receipt?source=share`): scan the share queue's
   * head instead of offering capture buttons, and advance through the queue on
   * save / skip. Omitted by every other host — the view is then unchanged.
   */
  shareMode?: boolean;
  /**
   * Share mode only: the route is not focused (the user went to the manual
   * form, or opened an expense on top). The next queued file waits instead of
   * scanning underneath — its alerts would pop up over the other screen.
   */
  paused?: boolean;
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
export function ReceiptExpenseView({ onDone, onEdit, onDirtyChange, onOpenExpense, shareMode, paused }: ReceiptExpenseViewProps) {
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
  /** "Merge with the bank's record" on the confirm card — reset per scan. */
  const [mergeWithBank, setMergeWithBank] = useState(false);
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
  const { getExpenseCategories } = useCategoryStore();

  /** Set when the user declines the ABA-603 duplicate prompt, so a `null` scan
   *  result can be told apart from a failed scan (which sets `error` instead). */
  const declinedRef = useRef(false);

  const discardShareQueue = () => {
    useShareIntakeStore.getState().discardAll().forEach((f) => void deleteSharedFile(f.uri));
  };

  const openExpense = (expenseId: string) => {
    if (onOpenExpense) onOpenExpense(expenseId);
    else router.push(`/expense/${expenseId}`);
  };

  /**
   * Stage 1 of the duplicate warning (ABA-603): the same file was already
   * scanned and saved. Asked BEFORE the file is uploaded, so declining costs
   * no AI request. Every button settles the promise; a dismissal without one
   * (web scrim, Android back) reads as "don't scan".
   */
  const confirmDuplicateScan = (match: ReceiptDuplicateMatch) =>
    new Promise<boolean>((resolve) => {
      showAlert(
        t('receipt.duplicateExactTitle'),
        t('receipt.duplicateExactBody', { what: describeDuplicateMatch(match, getIntlLocale()) }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
            onPress: () => {
              declinedRef.current = true;
              resolve(false);
            },
          },
          {
            text: t('receipt.duplicateOpen'),
            onPress: () => {
              resolve(false);
              if (shareMode) {
                // Leaving for the saved expense ends the share run. Replace, not
                // push: the queue is gone, so there is nothing to come back to —
                // and NOT marking it declined keeps advanceQueue (whose onDone
                // would pop the expense just opened) from running.
                discardShareQueue();
                router.replace(`/expense/${match.expenseId}`);
                return;
              }
              openExpense(match.expenseId);
            },
          },
          { text: t('receipt.scanAnyway'), onPress: () => resolve(true) },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            declinedRef.current = true;
            resolve(false);
          },
        },
      );
    });

  const {
    isProcessing,
    error,
    errorStatus,
    imageUri,
    isPdf,
    scannedReceipt,
    pickFromCamera,
    pickFromGallery,
    pickPdfDocument,
    processSharedFile,
    reset,
  } = useReceiptScanner({ onDuplicate: confirmDuplicateScan });

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
    if (!error) return;
    // `failed` covers only this scan-error branch. A SAVE failure inside
    // `useReceiptSave.handleConfirmExpense`'s own `catch` reports neither
    // `completed` nor `failed`, so it lands in the admin funnel's derived
    // `abandoned` bucket — this flow's abandoned count over-represents true
    // save failures relative to the other flows.
    trackAction('expense_receipt', 'failed');
    if (!shareMode) {
      showAlert(t('common.error'), error, [{ text: 'OK', onPress: reset }]);
      return;
    }
    if (errorStatus === 403) {
      // AI limit: every remaining file would fail identically — stop the run.
      const left = useShareIntakeStore.getState().discardAll();
      left.forEach((f) => void deleteSharedFile(f.uri));
      useUpgradeStore.getState().show(t('subscription.limitReachedBody'), 'pro');
      showAlert(t('shareIntake.limitStoppedTitle'), t('shareIntake.limitStoppedBody', { count: left.length }), [
        { text: 'OK', onPress: onDone },
      ]);
      return;
    }
    showAlert(t('common.error'), error, [
      { text: t('shareIntake.skip'), onPress: advanceQueue },
      {
        text: t('shareIntake.enterManually'),
        onPress: () => {
          advanceQueue();
          router.push('/expense/new');
        },
      },
    ]);
    // Keyed on `error` alone: the handlers read the live queue from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  useEffect(() => {
    if (scannedReceipt) {
      setShowConfirm(true);
      setMerchant(resolveExistingMerchant(scannedReceipt.merchant, getDistinctMerchants()));
      setMergeWithBank(defaultMergeWithBank(scannedReceipt.possibleDuplicate));
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
    setMergeWithBank(false);
    resetSplitState();
  };

  const { count: sessionCount, recordSaved } = useReceiptScanSession();

  // ── Share-to-capture ────────────────────────────────────────────────────
  const shareQueue = useShareIntakeStore((s) => s.queue);
  const sharePendingNavigation = useShareIntakeStore((s) => s.pendingNavigation);
  const shareDropped = useShareIntakeStore((s) => s.lastDropped);
  const shareHead = shareMode ? current(shareQueue) : null;
  const scannedUriRef = useRef<string | null>(null);

  /** Finish the queue head (saved, skipped or declined) and move on. */
  function advanceQueue() {
    const finished = useShareIntakeStore.getState().next();
    if (finished) void deleteSharedFile(finished.uri);
    handleReset();
    if (!current(useShareIntakeStore.getState().queue)) onDone();
  }

  // While open, the root hook stays idle (`decideShareNavigation`) and this view
  // consumes warm shares itself — they append, never stack a second route.
  useEffect(() => {
    if (!shareMode) return;
    useShareIntakeStore.getState().setScreenOpen(true);
    return () => useShareIntakeStore.getState().setScreenOpen(false);
  }, [shareMode]);

  useEffect(() => {
    if (shareMode && sharePendingNavigation) useShareIntakeStore.getState().consumeNavigation();
  }, [shareMode, sharePendingNavigation]);

  useEffect(() => {
    if (!shareMode || shareDropped === 0) return;
    showAlert(t('shareIntake.droppedTitle'), t('shareIntake.droppedBody', { count: shareDropped }));
    useShareIntakeStore.getState().clearDropped();
  }, [shareMode, shareDropped, t]);

  function scanShareHead(head: NonNullable<typeof shareHead>) {
    scannedUriRef.current = head.uri;
    declinedRef.current = false;
    void processSharedFile(head.uri, head.mimeType, head.name, head.size).then((r) => {
      if (r === null && declinedRef.current) advanceQueue();
    });
  }

  // Scan the head whenever it changes (first file, or after advancing) — but
  // only while this screen is focused.
  useEffect(() => {
    if (!shareHead || paused || scannedUriRef.current === shareHead.uri) return;
    scanShareHead(shareHead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareHead?.uri, paused]);

  /** "Scan again" on the confirm card: the head's URI has not changed, so the
   *  effect above would never re-run — re-scan it explicitly. */
  const retryShareHead = () => {
    handleReset();
    const head = current(useShareIntakeStore.getState().queue);
    if (head) scanShareHead(head);
  };

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
    mergeWithExpenseId:
      mergeWithBank && bankCopySource(scannedReceipt?.possibleDuplicate)
        ? scannedReceipt?.possibleDuplicate?.expenseId
        : undefined,
    // In share mode the only caller of onReset is "Edit" (there is no "Scan
    // another"): the file becomes the manual form's expense, so it leaves the
    // queue — otherwise the user returns to a stuck, already-handled head.
    onReset: shareMode ? advanceQueue : handleReset,
    onDone,
    onEdit,
    queue: shareMode
      ? { hasNext: remaining(shareQueue).length > 1, onNext: advanceQueue }
      : undefined,
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
          hideCaptureButtons={shareMode}
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
            onOpenDuplicate={openExpense}
            mergeWithBank={mergeWithBank}
            onToggleMergeWithBank={() => setMergeWithBank((v) => !v)}
            onEdit={handleEditExpense}
            onConfirm={handleConfirmExpense}
            onRetry={shareMode ? retryShareHead : handleReset}
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
