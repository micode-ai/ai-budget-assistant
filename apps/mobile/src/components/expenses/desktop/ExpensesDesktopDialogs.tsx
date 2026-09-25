import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Category, Tag } from '@budget/shared-types';
import { BulkTagPickerSheet } from '@/components/BulkTagPickerSheet';
import type { LedgerRow } from '@/features/expenses/desktopTable';
import { ExpenseDialog } from './ExpenseDialog';
import { CreateDialog } from './CreateDialog';
import { CategorizeDialog } from './CategorizeDialog';

interface Props {
  /** The ledger-row view/edit dialog (design decisions 4/5) — `null` renders
   *  nothing. Mirrors `ExpenseDialogProps` field-for-field; kept as its own
   *  explicit prop list here rather than spreading that type, since two of
   *  its fields (`row`/`initialEditing`) are genuinely required on THIS
   *  screen (a row is always known once one is selected) even though
   *  `ExpenseDialogProps` itself makes `initialEditing` optional for other
   *  callers like `useAlertTapThrough`. */
  selectedRow: LedgerRow | null;
  onCloseDialog: () => void;
  canEdit: boolean;
  isTripAccount: boolean;
  tripMembers: { userId: string; name: string }[];
  dialogInitialEditing: boolean;

  /** The "+ Add expense/income" dialog (Task 3, ABA-500) — `null` renders
   *  nothing. `ExpensesDesktop`'s two top-bar buttons set `createKind`
   *  directly; `handleAddExpense` from `useExpensesScreenData` is untouched
   *  and still what the mobile FAB uses to navigate to `/expense/new`. */
  createKind: 'expense' | 'income' | null;
  onCloseCreateDialog: () => void;

  /** The categorize review, opened from one of the two uncategorized banners
   *  above `SummaryStrip` — `null` renders nothing, `'expense'`/`'income'`
   *  says which one (mirrors `createKind`'s tri-state convention). */
  showCategorize: 'expense' | 'income' | null;
  onCloseCategorize: () => void;

  /** Bulk category picker, spawned from the selection bar. Reuses
   *  `multiSelect.handleBulkSetCategory` verbatim (the same list
   *  `ExpensesMobile.tsx` renders inline) — only the surrounding chrome is
   *  desktop's own: a centered panel mirroring `ExpenseDialog.tsx`'s scrim,
   *  rather than mobile's edge-to-edge bottom sheet stretched across a wide
   *  viewport. */
  showBulkCategoryPicker: boolean;
  onCloseBulkCategoryPicker: () => void;
  categories: Category[];
  onBulkSetCategory: (categoryId: string) => void;

  /** Bulk tag picker — hosts the SAME `BulkTagPickerSheet` mobile's bottom
   *  sheet already uses; only its wrapper differs. */
  showBulkTagPicker: boolean;
  onCloseBulkTagPicker: () => void;
  allTags: Tag[];
  onBulkAddTags: (tagIds: string[]) => void;
}

/**
 * The five overlay "dialogs" `ExpensesDesktop` can have open — never more
 * than one at a time, since opening any of them requires closing whatever
 * was open before (`ExpenseDialog`'s scrim covers the row list, the bulk
 * pickers only open from the selection bar which itself sits under any open
 * dialog, etc.) — consolidated into one component the root screen renders
 * unconditionally, each slot deciding for itself whether it has anything to
 * show (tech-debt `expenses-desktop-screen-god-file`'s proposed fix).
 *
 * `ExpensesDesktop` keeps every piece of the underlying STATE (which row is
 * selected, which create kind is open, whether either bulk picker is
 * visible) — that state is inseparable from the screen's own row list,
 * selection, and row-menu wiring (e.g. the context menu's "Edit" action sets
 * `dialogInitialEditing` before this component ever renders). This component
 * only resolves already-decided state into JSX, so a future edit to WHAT
 * triggers a dialog stays in `ExpensesDesktop`, and an edit to HOW a dialog
 * looks stays here.
 *
 * The row context menu (`RowContextMenu`) is deliberately NOT one of the five
 * slots here — it isn't a dialog (no scrim, no focus trap, it's a small
 * anchored popover), it's already its own presentational component with its
 * own viewport-clamped positioning, and the state it needs (`menuState`,
 * `handleDuplicate`, `handleDeleteFromList`) is the same screen-level state
 * this component's own props are already resolved from, so folding it in
 * here would only add indirection.
 */
export function ExpensesDesktopDialogs({
  selectedRow,
  onCloseDialog,
  canEdit,
  isTripAccount,
  tripMembers,
  dialogInitialEditing,
  createKind,
  onCloseCreateDialog,
  showCategorize,
  onCloseCategorize,
  showBulkCategoryPicker,
  onCloseBulkCategoryPicker,
  categories,
  onBulkSetCategory,
  showBulkTagPicker,
  onCloseBulkTagPicker,
  allTags,
  onBulkAddTags,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      {selectedRow && (
        <ExpenseDialog
          row={selectedRow}
          onClose={onCloseDialog}
          canEdit={canEdit}
          isTripAccount={isTripAccount}
          tripMembers={tripMembers}
          initialEditing={dialogInitialEditing}
        />
      )}

      {createKind && <CreateDialog kind={createKind} onClose={onCloseCreateDialog} />}

      {showCategorize && <CategorizeDialog entityType={showCategorize} onClose={onCloseCategorize} />}

      {showBulkCategoryPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={onCloseBulkCategoryPicker}>
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) onCloseBulkCategoryPicker();
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
            <View style={styles.pickerPanel}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{t('expenses.bulkSetCategory')}</Text>
                <Pressable onPress={onCloseBulkCategoryPicker} accessibilityRole="button">
                  <Text style={styles.pickerCancel}>{t('common.cancel')}</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.pickerList}>
                {categories
                  .filter((c) => !c.isDeleted)
                  .map((cat) => (
                    <Pressable
                      key={cat.id}
                      style={styles.pickerRow}
                      onPress={() => onBulkSetCategory(cat.id)}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={(cat.icon as any) || 'pricetag-outline'}
                        size={18}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.pickerRowText}>{cat.name}</Text>
                    </Pressable>
                  ))}
                {categories.filter((c) => !c.isDeleted).length === 0 && (
                  <Text style={styles.pickerEmpty}>{t('expenses.categoryAll')}</Text>
                )}
              </ScrollView>
            </View>
          </div>
        </Modal>
      )}

      {showBulkTagPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={onCloseBulkTagPicker}>
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) onCloseBulkTagPicker();
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
            <View style={styles.pickerPanel}>
              <BulkTagPickerSheet tags={allTags} onConfirm={onBulkAddTags} onClose={onCloseBulkTagPicker} />
            </View>
          </div>
        </Modal>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  pickerPanel: {
    width: '90%' as const,
    maxWidth: 420,
    maxHeight: '80%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  pickerHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  pickerTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  pickerCancel: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
  },
  pickerList: {
    maxHeight: 360,
  },
  pickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  pickerRowText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  pickerEmpty: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
});
