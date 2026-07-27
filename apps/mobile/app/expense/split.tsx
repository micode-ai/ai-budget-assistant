/**
 * Receipt-split creation screen — `/expense/split?expenseId=<id>`.
 *
 * The payer (who paid a shared bill) assigns each receipt line item to a
 * named participant — or, when the receipt has no line items, falls back to
 * splitting the whole bill evenly — then creates a public guest link per
 * participant. Each guest opens their link and sees only their own share;
 * they never need the app.
 *
 * Once a split exists for this expense, this SAME route becomes the status
 * view (Task 5 of the mobile plan): one row per participant with a
 * status badge, a per-row Send (native share sheet) action, a Copy-all-links
 * action, and a Confirm-received action that appears only once a guest has
 * marked their share as claimed. Cancel lives here too (unblocked by Task 7's
 * partial unique index — see `src/components/split/validateSplit.ts` if that
 * ever needs re-checking). See the `if (split)` block below.
 *
 * Hard rule (binding across both plans): the client NEVER computes an
 * authoritative share amount. `SplitStateResponse.ownShare` and every
 * participant's `amount` come only from the server; see
 * `src/components/split/validateSplit.ts`'s docstring for the one place a
 * client-side aggregate is computed, and why that number is validation-only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Share } from 'react-native';
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
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { ParticipantChips, type ParticipantChipItem } from '@/components/split/ParticipantChips';
import { validateSplit, MAX_SPLIT_PARTICIPANTS, type SplitParticipantCandidate } from '@/components/split/validateSplit';
import { deriveSplitMode } from '@/components/split/deriveSplitMode';
import { computeParticipantAssignmentSummaries } from '@/components/split/participantAssignmentSummary';
import { filterAvailableRecentNames } from '@/components/split/recentParticipants';
import { showAlert } from '@/utils/alert';
import { formatCurrency } from '@budget/shared-utils';
import type { CreateSplitDto, SplitParticipantState, SplitParticipantStatus } from '@budget/shared-types';

const OVER_BILL_TOLERANCE = 0.01;

// Compile-time checked: TS requires every SplitParticipantStatus member to
// have an entry here, so a future 5th status fails the build instead of
// silently rendering as a raw key string (the bug this replaced — see the
// `as any` cast that used to live in the `if (split)` branch).
const STATUS_LABEL_KEYS: Record<SplitParticipantStatus, string> = {
  sent: 'receiptSplit.statusSent',
  opened: 'receiptSplit.statusOpened',
  claimed: 'receiptSplit.statusClaimed',
  settled: 'receiptSplit.statusSettled',
};

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

  // Status→color, not status→label (that's STATUS_LABEL_KEYS above) — colors
  // must read from the live theme (accent/light/dark), so this can't be a
  // module-scope constant the way the label-key map is.
  const statusColors: Record<SplitParticipantStatus, string> = {
    sent: theme.colors.textTertiary,
    opened: theme.colors.info,
    claimed: theme.colors.warning,
    settled: theme.colors.success,
  };

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
  // the payer returns to this screen — see Fix 6) and the line items (so a
  // receipt that was still syncing on the last visit can flip into item mode
  // once its items round-trip through the server).
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

  const [participants, setParticipants] = useState<ParticipantChipItem[]>([]);
  // itemId -> participant.id. An item not present here stays with the payer.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Status-view state (Task 5): which participant row is mid-confirm, and
  // whether a cancel is in flight.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const priceByItemId = useMemo(() => new Map(items.map((i) => [i.id, i.totalPrice])), [items]);

  // Per-chip item count + CLIENT-SIDE subtotal (guidance only — see
  // ParticipantChips.tsx's docstring). Item mode only: there is no
  // per-person assignment concept in an equal split.
  const assignmentSummaries = useMemo(
    () =>
      mode === 'items'
        ? computeParticipantAssignmentSummaries(
            participants.map((p) => p.id),
            assignments,
            priceByItemId,
          )
        : undefined,
    [mode, participants, assignments, priceByItemId],
  );

  // "People you've split with before" suggestion chips: server-recent names,
  // narrowed to exclude anyone already added to THIS split and (while typing)
  // to substring matches — mirrors app/expense/location.tsx's recents UX.
  // Capped to 6 for layout, same convention as that screen's search results.
  const availableRecentNames = useMemo(
    () =>
      filterAvailableRecentNames(
        recentParticipantNames,
        newPersonName,
        participants.map((p) => p.name),
      ).slice(0, 6),
    [recentParticipantNames, newPersonName, participants],
  );

  function handleConfirmAddPerson() {
    const trimmed = newPersonName.trim();
    if (trimmed) {
      setParticipants((prev) => [...prev, { id: `p-${Date.now()}-${prev.length}`, name: trimmed }]);
    }
    setNewPersonName('');
    setIsAddingPerson(false);
  }

  // Tapping a "people you've split with before" suggestion adds them directly
  // — the whole point is to let the payer tap instead of retype.
  function handleSelectRecentName(name: string) {
    setParticipants((prev) => [...prev, { id: `p-${Date.now()}-${prev.length}`, name }]);
    setNewPersonName('');
    setIsAddingPerson(false);
  }

  function handleRemoveParticipant(participantId: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [itemId, pid] of Object.entries(next)) {
        if (pid === participantId) delete next[itemId];
      }
      return next;
    });
  }

  function handleSelectItem(itemId: string) {
    if (mode !== 'items' || !canEdit) return;
    setSelectedItemId((prev) => (prev === itemId ? null : itemId));
  }

  function handleSelectParticipant(participantId: string) {
    if (!canEdit || mode !== 'items' || !selectedItemId) return;
    setAssignments((prev) => ({ ...prev, [selectedItemId]: participantId }));
    setSelectedItemId(null);
  }

  function participantNameFor(itemId: string): string | null {
    const pid = assignments[itemId];
    if (!pid) return null;
    return participants.find((p) => p.id === pid)?.name ?? null;
  }

  // Client-side aggregate for the overBill guard ONLY — never rendered as a
  // participant's or the payer's authoritative share. See validateSplit.ts.
  const validationCandidates: SplitParticipantCandidate[] = useMemo(() => {
    if (mode === 'equal') {
      const perHead = participants.length > 0 ? billTotal / (participants.length + 1) : 0;
      return participants.map((p) => ({ name: p.name, shareAmount: perHead }));
    }
    return participants.map((p) => {
      const shareAmount = Object.entries(assignments)
        .filter(([, pid]) => pid === p.id)
        .reduce((sum, [itemId]) => sum + (priceByItemId.get(itemId) ?? 0), 0);
      return { name: p.name, shareAmount };
    });
  }, [participants, assignments, mode, billTotal, priceByItemId]);

  const isValid = validateSplit(validationCandidates, billTotal);
  const showTooManyHint = participants.length > MAX_SPLIT_PARTICIPANTS;
  const showOverBillHint =
    validationCandidates.reduce((sum, p) => sum + p.shareAmount, 0) > billTotal + OVER_BILL_TOLERANCE;
  // A named friend with nothing assigned resolves to a 0 share, which the server
  // rejects outright — that used to only surface as a single generic bottom-of-screen
  // hint (`assignEveryone`, still in i18n but no longer rendered here). Each
  // participant chip now shows its own "0 items" warning in-place (see
  // ParticipantChips.tsx), which is more actionable — it names WHO still needs
  // something assigned — so the generic hint would just be noise underneath it.

  async function handleCreate() {
    if (!expense || !canEdit || !isValid || isEncryptedAccount || isCreating) return;
    setIsCreating(true);
    try {
      const dto: CreateSplitDto = {
        mode,
        participants: participants.map((p) => ({
          name: p.name,
          itemIds:
            mode === 'items'
              ? Object.entries(assignments)
                  .filter(([, pid]) => pid === p.id)
                  .map(([itemId]) => itemId)
              : undefined,
        })),
      };
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
      // that's simply what `if (split) { … } … return (creation form)` does
      // once `split` is null again.
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
    // A split already exists — this is now the full interactive status view
    // (Task 5): share/copy links, per-participant confirm, cancel.
    // `ownShare` is the server's number, shown as-is; the client never
    // re-derives it.
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>{t('receiptSplit.yourShare')}</Text>
          <Text style={styles.amountText}>{formatCurrency(split.ownShare, split.currencyCode)}</Text>

          <View style={styles.itemsCard}>
            {split.participants.map((p, index) => (
              <View
                key={p.id}
                style={[styles.statusRow, index < split.participants.length - 1 && styles.itemDivider]}
              >
                <View style={styles.statusRowHeader}>
                  <Text style={styles.itemDescription} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {/* statusColors/STATUS_LABEL_KEYS are Record<SplitParticipantStatus, …> —
                      a compile error here, not a silent raw-key render, if a status is ever added. */}
                  <Text style={[styles.statusBadgeText, { color: statusColors[p.status] }]}>
                    {t(STATUS_LABEL_KEYS[p.status])}
                  </Text>
                  <Text style={styles.itemPrice}>{formatCurrency(p.amount, p.currencyCode)}</Text>
                </View>

                <View style={styles.statusRowActions}>
                  <TouchableOpacity
                    style={styles.statusActionBtn}
                    onPress={() => handleSend(p)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="share-outline" size={14} color={theme.colors.primary} />
                    <Text style={styles.statusActionText} numberOfLines={1}>
                      {t('common.share')}
                    </Text>
                  </TouchableOpacity>

                  {/* A `claimed` guest is only saying they paid — this button is the
                      payer's own verification step that turns it into `settled`.
                      Never shown for `sent`/`opened` (nothing to nag about) or
                      `settled` (already done), and never rendered for a viewer. */}
                  {canEdit && p.status === 'claimed' && (
                    <TouchableOpacity
                      style={[styles.statusActionBtn, styles.confirmActionBtn]}
                      onPress={() => handleConfirm(p)}
                      activeOpacity={0.7}
                      disabled={confirmingId === p.id}
                    >
                      {confirmingId === p.id ? (
                        <ActivityIndicator size="small" color={theme.colors.success} />
                      ) : (
                        <>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={14}
                            color={theme.colors.success}
                          />
                          <Text
                            style={[styles.statusActionText, styles.confirmActionText]}
                            numberOfLines={1}
                          >
                            {t('receiptSplit.confirmPaid')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.copyAllBtn} onPress={handleCopyAll} activeOpacity={0.7}>
            <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.copyAllText}>{t('receiptSplit.copyAll')}</Text>
          </TouchableOpacity>

          {canEdit && (
            <TouchableOpacity
              style={styles.cancelSplitBtn}
              onPress={handleCancelPress}
              activeOpacity={0.7}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color={theme.colors.danger} />
              ) : (
                <Text style={styles.cancelSplitText}>{t('receiptSplit.cancelSplit')}</Text>
              )}
            </TouchableOpacity>
          )}
        </KeyboardAwareScreen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        {isEncryptedAccount && (
          <View style={styles.warningBox}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.colors.danger} />
            <Text style={styles.warningText}>{t('receiptSplit.encrypted')}</Text>
          </View>
        )}

        <Text style={styles.billText}>{formatCurrency(billTotal, expense.currencyCode)}</Text>
        {expense.merchant ? <Text style={styles.merchantText}>{expense.merchant}</Text> : null}

        {mode === 'equal' ? (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.info} />
            <View style={styles.hintTextWrap}>
              <Text style={styles.sectionTitle}>{t('receiptSplit.equalMode')}</Text>
              {/* hasUnsyncedItems: real line items exist locally but haven't round-tripped
                  through the server yet, so their ids aren't safe to submit — reusing
                  `settings.syncing` ("Syncing...") rather than the "no line items" copy,
                  which would be misleading here. No new i18n key. */}
              <Text style={styles.hintText}>
                {hasUnsyncedItems ? t('settings.syncing') : t('receiptSplit.equalHint')}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t('receiptSplit.assignHint')}</Text>
            <View style={styles.itemsCard}>
              {items.map((item, index) => {
                const assignedName = participantNameFor(item.id);
                const selected = selectedItemId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.itemRow,
                      index < items.length - 1 && styles.itemDivider,
                      selected && styles.itemRowSelected,
                    ]}
                    onPress={() => handleSelectItem(item.id)}
                    activeOpacity={canEdit ? 0.7 : 1}
                    disabled={!canEdit}
                  >
                    {/* The thing that IS actually selected is THIS item, not any person
                        chip — a radio-style icon makes that state unambiguous and gives
                        it a visual language distinct from the chips' dashed tap-target
                        outline below (see ParticipantChips.tsx's docstring). */}
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={16}
                      color={selected ? theme.colors.primary : theme.colors.textTertiary}
                    />
                    <Text style={styles.itemDescription} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <View style={styles.itemAssignBadge}>
                      {assignedName ? (
                        <Text style={styles.itemAssignedText} numberOfLines={1}>
                          {assignedName}
                        </Text>
                      ) : (
                        <Ionicons name="person-add-outline" size={14} color={theme.colors.textTertiary} />
                      )}
                    </View>
                    <Text style={styles.itemPrice}>
                      {formatCurrency(item.totalPrice, expense.currencyCode)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{t('receiptSplit.title')}</Text>

        {/* Only rendered while an item is genuinely awaiting a person — this
            instruction, not a filled chip look, is what tells the payer what
            to do next (see ParticipantChips.tsx's docstring for the full
            rationale). */}
        {mode === 'items' && !!selectedItemId && (
          <View style={styles.tapHintRow}>
            <Ionicons name="hand-left-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.tapHintText}>{t('receiptSplit.tapPersonHint')}</Text>
          </View>
        )}

        <ParticipantChips
          participants={participants}
          awaitingAssignment={mode === 'items' && !!selectedItemId}
          assignmentSummaries={assignmentSummaries}
          currencyCode={expense.currencyCode}
          onPress={handleSelectParticipant}
          onRemove={handleRemoveParticipant}
          onAddPress={() => setIsAddingPerson(true)}
          canEdit={canEdit}
        />

        {isAddingPerson && canEdit && (
          <>
            <View style={styles.addPersonRow}>
              <TextInput
                style={styles.addPersonInput}
                value={newPersonName}
                onChangeText={setNewPersonName}
                placeholder={t('receiptSplit.personName')}
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleConfirmAddPerson}
              />
              <TouchableOpacity style={styles.addPersonConfirm} onPress={handleConfirmAddPerson}>
                <Ionicons name="checkmark" size={18} color={theme.colors.textInverse} />
              </TouchableOpacity>
            </View>

            {/* "People you've split with before" — shown empty-box (all available
                recents) and narrowed while typing, same UX as the "Recent" list in
                app/expense/location.tsx. */}
            {availableRecentNames.length > 0 && (
              <View style={styles.recentNamesWrap}>
                <Text style={styles.recentNamesLabel}>{t('receiptSplit.recentPeople')}</Text>
                <View style={styles.recentNamesRow}>
                  {availableRecentNames.map((name) => (
                    <TouchableOpacity
                      key={name}
                      style={styles.recentNameChip}
                      onPress={() => handleSelectRecentName(name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="time-outline" size={12} color={theme.colors.textTertiary} />
                      <Text style={styles.recentNameChipText} numberOfLines={1}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {showTooManyHint && <Text style={styles.errorHint}>{t('receiptSplit.tooMany')}</Text>}
        {showOverBillHint && <Text style={styles.errorHint}>{t('receiptSplit.overBill')}</Text>}
      </KeyboardAwareScreen>

      {canEdit && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (!isValid || isEncryptedAccount || isCreating) && styles.confirmBtnDisabled,
            ]}
            onPress={handleCreate}
            disabled={!isValid || isEncryptedAccount || isCreating}
            activeOpacity={0.8}
          >
            {isCreating ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.confirmBtnText}>{t('receiptSplit.createSplit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
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
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[3],
  },
  billText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  merchantText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: -theme.spacing[2],
  },
  amountText: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  warningBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  warningText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    flex: 1,
  },
  hintBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  hintTextWrap: {
    flex: 1,
  },
  hintText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  itemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden' as const,
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  itemRowSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  itemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  itemDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  itemAssignBadge: {
    minWidth: 60,
    alignItems: 'flex-end' as const,
  },
  itemAssignedText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    fontFamily: theme.fonts.semiBold,
  },
  itemPrice: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    minWidth: 70,
    textAlign: 'right' as const,
  },
  statusRow: {
    flexDirection: 'column' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  statusRowHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  statusBadgeText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
  },
  statusRowActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  statusActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
  confirmActionBtn: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successLight,
  },
  confirmActionText: {
    color: theme.colors.success,
  },
  copyAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  copyAllText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  cancelSplitBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
  cancelSplitText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
  addPersonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  addPersonInput: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
  },
  addPersonConfirm: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tapHintRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  tapHintText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  recentNamesWrap: {
    gap: theme.spacing[1.5],
  },
  recentNamesLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  recentNamesRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  recentNameChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recentNameChipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  errorHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
  },
  footer: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  confirmBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    alignSelf: 'stretch' as const,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
});
