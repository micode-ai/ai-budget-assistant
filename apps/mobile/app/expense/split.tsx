/**
 * Receipt-split screen — `/expense/split?expenseId=<id>`.
 *
 * The payer (who paid a shared bill) assigns each receipt line item to a
 * named participant — or, when the receipt has no line items, falls back to
 * splitting the whole bill evenly — then creates a public guest link per
 * participant. Each guest opens their link and sees only their own share;
 * they never need the app. That creation form is `AssignmentEditor`
 * (`src/components/receipt-split/`).
 *
 * Once a split exists for this expense, this SAME route becomes the status
 * view: one row per participant with a status badge, a per-row Send (native
 * share sheet) action, a Copy-all-links action, and a Confirm-received
 * action that appears only once a guest has marked their share as claimed.
 * Cancel lives here too. That view is `ParticipantStatusList`.
 *
 * This file is the thin composition root: it resolves the expense/items,
 * loads the split state, and decides which of the two components to render
 * — it does not itself own any assignment-form or status-row UI.
 *
 * Hard rule (binding across both components): the client NEVER computes an
 * authoritative share amount. `SplitStateResponse.ownShare` and every
 * participant's `amount` come only from the server; see
 * `src/components/split/validateSplit.ts`'s docstring for the one place a
 * client-side aggregate is computed, and why that number is validation-only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useReceiptSplitStore } from '@/stores/receiptSplitStore';
import { useEncryptionStore } from '@/stores/encryptionStore';
import { AssignmentEditor } from '@/components/receipt-split/AssignmentEditor';
import { ParticipantStatusList } from '@/components/receipt-split/ParticipantStatusList';
import { deriveSplitMode } from '@/components/split/deriveSplitMode';
import { showAlert } from '@/utils/alert';
import type { CreateSplitDto, SplitParticipantState } from '@budget/shared-types';

export default function ReceiptSplitScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { expenseId: expenseIdParam } = useLocalSearchParams<{ expenseId?: string }>();

  const canEdit = useAccountStore((s) => s.canEdit());
  const { expenses, expenseItems, loadExpenseItems } = useExpenseStore();
  const {
    split,
    isLoading,
    load,
    create,
    confirm,
    cancel,
    recentParticipantNames,
    loadRecentParticipantNames,
  } = useReceiptSplitStore();

  // Same 4-way resolution as expense/[id].tsx / expense/location.tsx — a deep
  // link may carry the server PK while the local row is keyed by clientId.
  const expense = useMemo(
    () =>
      expenses.find(
        (e) =>
          !e.isDeleted &&
          (e.id === expenseIdParam ||
            e.serverId === expenseIdParam ||
            e.clientId === expenseIdParam ||
            e.localId === expenseIdParam),
      ),
    [expenses, expenseIdParam],
  );

  // `expense.items` is never populated on a mobile expense object — it's an
  // API-response-only field the SQLite `rowToExpense` mapper never sets. Line
  // items live in the store's separate `expenseItems` map (same pattern as
  // `ExpenseItemsSection.tsx`), hydrated on demand via `loadExpenseItems`.
  const rawItems = expense ? expenseItems[expense.id] : undefined;
  const items = useMemo(() => (rawItems ?? []).filter((i) => !i.isDeleted), [rawItems]);

  // See deriveSplitMode.ts's docstring for the full "why" — in short, only
  // server-synced items carry a real expense_item id, so a not-yet-synced
  // receipt degrades to a safe whole-bill equal split rather than a failed
  // (400) item-assignment request.
  const { mode, hasUnsyncedItems } = useMemo(() => deriveSplitMode(items), [items]);
  const billTotal = expense?.amount ?? 0;

  // Whether the initial item load for the CURRENT expense has settled. Gates
  // the creation form below so a fast tap can never fire before we know
  // whether this receipt actually has items — without this, `mode` starts as
  // 'equal' (rawItems undefined until the load resolves) and a quick Create
  // tap would silently whole-bill-split an itemized receipt.
  const [itemsLoaded, setItemsLoaded] = useState(false);

  // Single focus-driven refresh (mirrors app/family-feed/index.tsx): reloads
  // both the split status (so a guest's "I paid" push is reflected the moment
  // the payer returns to this screen) and the line items (so a receipt that
  // was still syncing on the last visit can flip into item mode once its
  // items round-trip through the server).
  useFocusEffect(
    useCallback(() => {
      if (!expense) return;
      void load(expense.id);

      // Account-wide, not expense-scoped — only worth fetching while this
      // screen can actually be used to CREATE a split (a viewer can't add
      // participants, and the server's ViewerBlockGuard would just 403 this
      // read the same way it blocks the write routes).
      if (canEdit) void loadRecentParticipantNames();

      setItemsLoaded(false);
      let cancelled = false;
      void loadExpenseItems(expense.id).finally(() => {
        if (!cancelled) setItemsLoaded(true);
      });
      return () => {
        cancelled = true;
      };
      // Intentionally re-runs only when the resolved expense identity changes
      // (same convention this effect replaced — see the file history).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expense?.id, load, loadExpenseItems, loadRecentParticipantNames, canEdit]),
  );

  // Proactive E2EE gate: a fully end-to-end encrypted (tier 2) account can't
  // be split because the server can never read the encrypted receipt items
  // (same rejection ExpenseCrossAccountService.moveToAccount applies).
  // Defaults to "not encrypted" until the check resolves; the create() catch
  // below is a second, reactive line of defense if that race is ever lost.
  const [isEncryptedAccount, setIsEncryptedAccount] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (expense?.accountId) {
      useEncryptionStore
        .getState()
        .getAccountTier(expense.accountId)
        .then((tier) => {
          if (!cancelled) setIsEncryptedAccount(tier >= 2);
        })
        .catch(() => {
          // fail-silent, mirrors getAccountTier's own fallback to tier 0
        });
    }
    return () => {
      cancelled = true;
    };
  }, [expense?.accountId]);

  const [isCreating, setIsCreating] = useState(false);

  // Status-view state: which participant row is mid-confirm, and whether a
  // cancel is in flight.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleCreate(dto: CreateSplitDto) {
    if (!expense || isCreating) return;
    setIsCreating(true);
    try {
      await create(expense.id, dto);
    } catch (e) {
      // console.warn, never console.error — RN's LogBox renders console.error
      // as a blocking full-screen red overlay.
      console.warn('[ReceiptSplitScreen] create failed', e);
      const status = (e as { status?: number } | null)?.status;
      const message = (e as { message?: string } | null)?.message ?? '';
      if (typeof status !== 'number') {
        // fetch() threw before a response ever came back — no connection.
        showAlert(t('common.error'), t('receiptSplit.offline'));
      } else if (/encrypt/i.test(message)) {
        // Reactive fallback for the proactive tier check above, in case that
        // race was lost (tier check hadn't resolved yet when Create was hit).
        setIsEncryptedAccount(true);
        showAlert(t('common.error'), t('receiptSplit.encrypted'));
      } else {
        showAlert(t('common.error'), t('errors.unknown'));
      }
    } finally {
      setIsCreating(false);
    }
  }

  // Not write actions — sharing/copying an already-issued link mutates
  // nothing server-side, so these are available to every role, unlike
  // confirm/cancel below.
  async function handleSend(p: SplitParticipantState) {
    try {
      await Share.share({
        message: `${t('receiptSplit.shareWith', { name: p.name })}\n${p.url}`,
        url: p.url,
      });
    } catch (e) {
      // console.warn, never console.error — see the create() catch above.
      console.warn('[ReceiptSplitScreen] share failed', e);
    }
  }

  async function handleCopyAll() {
    if (!split) return;
    const text = split.participants.map((p) => `${p.name}: ${p.url}`).join('\n');
    try {
      await Clipboard.setStringAsync(text);
      showAlert(t('common.success'));
    } catch (e) {
      console.warn('[ReceiptSplitScreen] copy failed', e);
    }
  }

  async function handleConfirm(p: SplitParticipantState) {
    if (!expense || !canEdit || confirmingId) return;
    setConfirmingId(p.id);
    try {
      await confirm(expense.id, p.id);
      showAlert(t('common.success'), t('receiptSplit.confirmedToast'));
    } catch (e) {
      // receiptSplitStore.confirm already rolled its optimistic update back
      // before rethrowing — this catch is what surfaces the failure to the
      // user; without it the rejection would be unhandled and the row would
      // silently stay stuck showing "settled" from the reverted state.
      console.warn('[ReceiptSplitScreen] confirm failed', e);
      showAlert(t('common.error'), t('errors.unknown'));
    } finally {
      setConfirmingId(null);
    }
  }

  function handleCancelPress() {
    showAlert(t('receiptSplit.cancelSplit'), t('receiptSplit.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('receiptSplit.cancelSplit'),
        style: 'destructive',
        onPress: () => void handleCancelConfirmed(),
      },
    ]);
  }

  async function handleCancelConfirmed() {
    if (!expense || !canEdit || isCancelling) return;
    setIsCancelling(true);
    try {
      await cancel(expense.id);
      // On success the store sets `split: null` — this same route then
      // re-renders straight into the pre-split creation form below, since
      // that's simply what "render AssignmentEditor once `split` is null
      // again" does.
    } catch (e) {
      console.warn('[ReceiptSplitScreen] cancel failed', e);
      showAlert(t('common.error'), t('errors.unknown'));
    } finally {
      setIsCancelling(false);
    }
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('expenseDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Also gates on `itemsLoaded` — the creation form (and its `mode`) must
  // never render before the item load has settled (see the mode-flip race
  // note above `itemsLoaded`'s declaration).
  if ((isLoading || !itemsLoaded) && !split) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (split) {
    return (
      <ParticipantStatusList
        split={split}
        canEdit={canEdit}
        confirmingId={confirmingId}
        isCancelling={isCancelling}
        onSend={handleSend}
        onConfirm={handleConfirm}
        onCopyAll={handleCopyAll}
        onCancelPress={handleCancelPress}
      />
    );
  }

  return (
    <AssignmentEditor
      billTotal={billTotal}
      currencyCode={expense.currencyCode}
      merchant={expense.merchant}
      items={items}
      mode={mode}
      hasUnsyncedItems={hasUnsyncedItems}
      isEncryptedAccount={isEncryptedAccount}
      recentParticipantNames={recentParticipantNames}
      canEdit={canEdit}
      isSubmitting={isCreating}
      onSubmit={handleCreate}
    />
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  notFoundText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  backBtn: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
  },
  backBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
});
