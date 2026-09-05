import { useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  ExpenseDetailsCard,
  type ExpenseDetailsCardHandle,
} from '@/components/expenses/detail/ExpenseDetailsCard';
import {
  IncomeDetailsCard,
  type IncomeDetailsCardHandle,
} from '@/components/income/detail/IncomeDetailsCard';
import { ExpenseItemsSection } from '@/components/expenses/detail/ExpenseItemsSection';
import { ReceiptSection } from '@/components/expenses/detail/ReceiptSection';
import { LocationSection } from '@/components/expenses/detail/LocationSection';
import type { LedgerRow } from '@/features/expenses/desktopTable';

/** Only one instance of this dialog is ever mounted at a time (`ExpensesDesktop`
 *  conditionally renders it, and the table beneath it is unreachable while it's
 *  open), so a fixed id is safe — no `useId()` needed. */
const TITLE_ID = 'expense-dialog-title';

interface Props {
  row: LedgerRow;
  onClose: () => void;
  canEdit: boolean;
  /** Group Trip Wallet: forwarded to `ExpenseDetailsCard` unchanged. A no-op
   *  (both default to falsy/empty) for every non-`trip` account, mirroring
   *  that card's own prop defaults. */
  isTripAccount?: boolean;
  tripMembers?: { userId: string; name: string }[];
  /**
   * Seeds `isEditing` at mount (Task 6 fix round 1) — the row context menu's
   * "Edit" opens the dialog straight into edit mode, the same destination
   * the pencil button reaches after one extra click, rather than navigating
   * to `expense/[id]` (decision 4 already replaced that navigation with this
   * dialog; a second, still-navigating "Edit" on the same row would have
   * been exactly the two-destinations defect decision 4 exists to prevent).
   * Defaults to `false` so every existing call site — a plain row click —
   * is unchanged. `ExpenseDetailsCard`/`IncomeDetailsCard` need no change to
   * support this: their local edit-field state is seeded from the `expense`/
   * `income` prop at declaration time regardless of `isEditing`, and their
   * own "reset fields" effect is keyed `if (!isEditing)` — a no-op on a
   * first render where `isEditing` is already `true`. Checked, not assumed,
   * by reading both cards' effect bodies.
   */
  initialEditing?: boolean;
}

/**
 * Desktop dialog (design spec decisions 4 and 5): the desktop equivalent of
 * tapping a row to navigate to `expense/[id]`/`income/[id]`. It HOSTS the same
 * `ExpenseDetailsCard`/`IncomeDetailsCard` those two screens already use — its
 * Save button calls `handle.triggerSave()` through a ref, exactly like
 * `app/expense/[id].tsx` does — so an edit is defined in exactly one place and
 * the desktop layer cannot drift from mobile on what an edit does. Branches on
 * `row.kind`; hosting two existing cards is still hosting, never a second
 * detail implementation.
 *
 * **The expense branch also hosts `ExpenseItemsSection`/`ReceiptSection`/
 * `LocationSection`, mirroring `app/expense/[id].tsx:296-306` verbatim (same
 * three components, same conditions, same order).** Decision 4 replaced
 * *navigating* to that screen with this dialog — it did not add a second,
 * lighter path alongside a still-reachable full detail screen. So anything
 * that screen shows and this dialog omits is now unreachable from desktop at
 * all. A receipt-scanned expense (the app's flagship input path) carries line
 * items, a photo, and often a geocoded pin; hosting `ExpenseDetailsCard` alone
 * would make all three invisible on the one screen meant to be approved as
 * the reference for every other desktop screen. Income has no equivalent of
 * any of the three (no line items, no receipt image, no location) — the
 * income branch is unaffected and stays exactly as narrow as the source data.
 *
 * **Built on React Native's own `<Modal>`, not a hand-rolled overlay or a new
 * dependency.** Verified by reading react-native-web's actual shipped source
 * (`node_modules/react-native-web/dist/exports/Modal/*.js`), not assumed: on
 * web, RN's `Modal` already ships a `ModalFocusTrap` that (1) moves focus to
 * the dialog's first focusable descendant once it is shown, (2) wraps `Tab`
 * at both ends of the dialog so it can never leave, and (3) captures whatever
 * had focus at mount time and restores it on unmount, if that element is
 * still in the document. For a row click, that captured element is the row's
 * own `Pressable` — react-native-web gives every `Pressable` `tabIndex={0}`,
 * and clicking a tabbable element focuses it (before `onPress` even fires) —
 * so "restore focus to the row that opened it" falls out of using `Modal`
 * rather than needing bespoke `document.activeElement` bookkeeping here.
 * `ModalContent` also sets `role="dialog"` + `aria-modal="true"` on its own
 * wrapper unconditionally, and answers `Esc` via the standard `onRequestClose`
 * prop. Reusing this is also reusing what `app/expense/[id].tsx`'s own
 * move-account picker already builds on, so this isn't a new pattern either.
 *
 * The one thing `Modal` does NOT give for free is a click-outside-closes
 * scrim, built here as a plain, deliberately un-tabbable `<div>` rather than
 * an RN `Pressable` — a `Pressable` always emits a `tabIndex` attribute (`0`,
 * or `-1` if disabled), and ANY tabindex attribute — including a negative one
 * — makes an element a valid target for `.focus()`, which is all the focus
 * trap's `focusFirstDescendant` walk checks for. A `Pressable` scrim would
 * therefore be the very FIRST focusable descendant in the dialog and would
 * steal the initial focus that should land on the header's Edit/Close button.
 * A bare `<div>` with no tabindex at all is genuinely unfocusable, so the walk
 * correctly skips over it and recurses into the real content. This mirrors
 * `TransactionTable.tsx`'s own precedent for reaching past RN's cross-platform
 * primitives on this web-only surface (`SortButton`'s raw `<button>`) for the
 * same reason: a real DOM semantic that RN's prop types don't model.
 */
export function ExpenseDialog({
  row,
  onClose,
  canEdit,
  isTripAccount = false,
  tripMembers = [],
  initialEditing = false,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [isEditing, setIsEditing] = useState(initialEditing);
  const expenseRef = useRef<ExpenseDetailsCardHandle>(null);
  const incomeRef = useRef<IncomeDetailsCardHandle>(null);

  const isIncome = row.kind === 'income';
  const description = isIncome ? row.income.description : row.expense.description;
  const title = description || t(isIncome ? 'nav.income' : 'dashboard.expense');

  /**
   * `ExpenseDetailsCardHandle`/`IncomeDetailsCardHandle` expose only
   * `triggerSave()` — neither card reports whether any field was actually
   * touched, only this dialog's own `isEditing` toggle is observable from
   * here. So "closing while editing asks before discarding" can only mean
   * "the outer Edit toggle is currently on", not "something was changed" —
   * a coarser signal than a real dirty flag, but an honest one given what
   * the cards actually expose. Inventing a dirty flag neither handle carries
   * was rejected; asking every time the toggle is on, even untouched, is the
   * closest true reading of the requirement.
   */
  const requestClose = () => {
    if (isEditing) {
      showAlert(
        t('expensesDesktop.discardChangesTitle'),
        t('expensesDesktop.discardChangesMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('expensesDesktop.discardChangesConfirm'), style: 'destructive', onPress: onClose },
        ],
      );
      return;
    }
    onClose();
  };

  /**
   * Fire-and-forget, exactly like `app/expense/[id].tsx`'s own Save button
   * (`onPress={() => detailsCardRef.current?.triggerSave()}`) — it never
   * awaits the handle either, relying entirely on the card's own `onSaved()`
   * callback (called as the LAST step inside `triggerSave`, after any async
   * work settles) to flip `isEditing` back off. A call site that doesn't
   * await treats a returned `Promise<void>` (expense) and a returned `void`
   * (income) identically, so this one call covers both cards without
   * branching on which handle is async — matching mobile's behaviour rather
   * than adding a loading/disabled state mobile itself doesn't have.
   */
  const handleSave = () => {
    if (isIncome) incomeRef.current?.triggerSave();
    else expenseRef.current?.triggerSave();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={requestClose} aria-labelledby={TITLE_ID}>
      {/* Deliberately a raw <div>, not a themed RN View/Pressable — see the
          file-level comment for why it must carry no tabindex at all. */}
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.overlay,
          padding: 24,
        }}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.headerActions}>
              {canEdit && !isEditing && (
                <Pressable
                  onPress={() => setIsEditing(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.edit')}
                  style={styles.iconButton}
                >
                  <Ionicons name="pencil" size={18} color={theme.colors.primary} />
                </Pressable>
              )}
              <Pressable
                onPress={requestClose}
                accessibilityRole="button"
                accessibilityLabel={t('expensesDesktop.dialogClose')}
                style={styles.iconButton}
              >
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {isIncome ? (
              <IncomeDetailsCard
                ref={incomeRef}
                income={row.income}
                isEditing={isEditing}
                onSaved={() => setIsEditing(false)}
              />
            ) : (
              <>
                {/* The amount is NOT part of `ExpenseDetailsCard` — the card
                    renders it only as an edit FIELD. On mobile the read-only
                    amount is drawn by `app/expense/[id].tsx:188-200`, outside
                    the card, so hosting the card alone opened an expense with
                    no amount at all. Mirrored here with the same discount and
                    deposit conditions. (`IncomeDetailsCard` owns its own
                    amount, which is why only this branch needs it — do not
                    "fix" that asymmetry by moving either one.) */}
                <View style={styles.amountCard}>
                  <Text style={styles.amountText}>
                    {formatCurrency(row.expense.amount, row.expense.currencyCode)}
                  </Text>
                  {row.expense.discountAmount != null && row.expense.discountAmount > 0 && (
                    <Text style={styles.amountNote}>
                      {t('receipt.discount')}: -
                      {formatCurrency(row.expense.discountAmount, row.expense.currencyCode)}
                    </Text>
                  )}
                  {row.expense.depositAmount != null && row.expense.depositAmount > 0 && (
                    <Text style={styles.amountNote}>
                      {t('receipt.deposit')}:{' '}
                      {formatCurrency(row.expense.depositAmount, row.expense.currencyCode)}
                    </Text>
                  )}
                </View>
                <ExpenseDetailsCard
                  ref={expenseRef}
                  expense={row.expense}
                  isEditing={isEditing}
                  onSaved={() => setIsEditing(false)}
                  isTripAccount={isTripAccount}
                  tripMembers={tripMembers}
                />

                {/* Mirrors `app/expense/[id].tsx:296-306` exactly — same three
                    sections, same conditions, same order. Decision 4 replaced
                    navigating to that screen with this dialog, so anything it
                    shows and this dialog didn't would be unreachable from
                    desktop entirely; there is no "open full detail" path left
                    to fall back to. `row.expense.id` is the same LOCAL id
                    `[id].tsx` passes as its route param — these sections
                    already key off that, never the server id. */}
                {row.expense.source === 'ocr' && (
                  <ExpenseItemsSection expenseId={row.expense.id} currencyCode={row.expense.currencyCode} />
                )}
                <ReceiptSection expenseId={row.expense.id} />
                <LocationSection expense={row.expense} canEdit={canEdit} />
              </>
            )}
          </ScrollView>

          {isEditing && (
            <View style={styles.footer}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setIsEditing(false)}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={handleSave} accessibilityRole="button">
                <Ionicons name="checkmark" size={18} color={theme.colors.textInverse} />
                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  amountCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  amountText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  amountNote: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    maxHeight: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    padding: theme.spacing[4],
  },
  footer: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
