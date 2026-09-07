import { useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { BudgetDetailView } from '@/components/budgets/BudgetDetailView';
import { BudgetEditForm } from '@/components/budget/BudgetEditForm';
import type { Budget } from '@budget/shared-types';

/** Only one instance is ever mounted at a time (`BudgetsDesktop` renders it
 *  from a single `selectedBudgetId` slot), so a fixed id is safe — same
 *  reasoning as `ExpenseDialog.tsx`'s `TITLE_ID`. */
const TITLE_ID = 'budget-dialog-title';

interface Props {
  budget: Budget;
  onClose: () => void;
}

/**
 * Desktop equivalent of navigating to `/budget/[id]`. HOSTS the same
 * `BudgetDetailView`/`BudgetEditForm` the mobile route already renders,
 * switching between them on an `isEditing` boolean exactly like
 * `app/budget/[id].tsx` does — an edit is defined in exactly one place, the
 * rule every dialog on this branch follows.
 *
 * **Deliberate departure from the design doc's original "Edit/Delete as
 * header icon buttons" plan.** By the time this task started,
 * `BudgetDetailView` already rendered its own `canEdit`-gated Edit/Delete
 * row at the bottom of its content (an earlier task on this branch, commit
 * 8e06e392, closed the pre-existing mobile gap where those buttons were
 * shown to viewers unconditionally). Re-homing them into this dialog's own
 * header — the design's original plan — would mean one of two things: a
 * SECOND, separately-gated Edit/Delete pair living in the chrome alongside
 * the one already inside the hosted view (the gate duplicated), or ripping
 * the existing row back out of `BudgetDetailView` (touching a component
 * this task was told explicitly to leave alone — see that file's own prop
 * doc). Neither is "hosting an existing component"; both are reimplementing
 * a decision that already shipped correctly. So this header stays
 * deliberately minimal — a title and a Close button, mirroring
 * `ExpenseDialog`'s header shape but with no icon actions of its own, since
 * Edit/Delete already live inside the hosted view/form exactly as the route
 * shows them.
 *
 * `referenceDate` is owned HERE, not inside `BudgetDetailView` — the exact
 * same reason the route owns it today (see that component's own prop doc):
 * toggling `isEditing` unmounts and remounts the view, so if the date lived
 * inside it, cancelling an edit would silently reset period navigation back
 * to "now" instead of wherever the user had navigated.
 *
 * Sized like `CreateDialog` (a definite `height`, not `ExpenseDialog`'s
 * shrink-to-fit `maxHeight`) — `BudgetDetailView` and `BudgetEditForm` are
 * both whole-screen layouts (`SafeAreaView(flex:1) -> ScrollView`, the exact
 * subtree the mobile route renders full-screen today), not plain
 * non-scrolling cards, the same reasoning `CreateDialog`'s file header gives
 * for `ExpenseCreateForm`/`IncomeCreateForm`.
 */
export function BudgetDialog({ budget, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [isEditing, setIsEditing] = useState(false);
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());

  /**
   * Reuses `ExpenseDialog`'s exact `requestClose` heuristic and its exact
   * three i18n keys (design's "The dialogs") — neither `BudgetEditForm` nor
   * `BudgetDetailView` reports a real dirty flag, so "ask whenever the edit
   * toggle is on" is the same honest signal here as it is there.
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

  return (
    <Modal visible transparent animationType="fade" onRequestClose={requestClose} aria-labelledby={TITLE_ID}>
      {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
          `ExpenseDialog.tsx`'s file-level comment for why it must carry no
          tabindex at all. */}
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
              {budget.name}
            </Text>
            <Pressable
              onPress={requestClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {isEditing ? (
              <BudgetEditForm
                budget={budget}
                onSaved={() => setIsEditing(false)}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <BudgetDetailView
                budget={budget}
                referenceDate={referenceDate}
                onReferenceDateChange={setReferenceDate}
                onEdit={() => setIsEditing(true)}
                onDeleted={onClose}
                desktop
              />
            )}
          </View>
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    // A definite height, not `ExpenseDialog`'s `maxHeight` — see the
    // file-level comment for why these two hosted components need one.
    height: '85%' as const,
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
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  body: {
    flex: 1,
  },
});
