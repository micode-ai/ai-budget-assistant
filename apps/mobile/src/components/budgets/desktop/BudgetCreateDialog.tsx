import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { BudgetCreateForm } from '@/components/budgets/BudgetCreateForm';

/** Only one instance is ever mounted at a time (`BudgetsDesktop` renders it
 *  from a single `createOpen` slot, and the "+" button that opens it is
 *  itself unreachable while `BudgetDialog` is open, since that dialog's
 *  scrim covers the whole screen) — same reasoning as `CreateDialog.tsx`'s
 *  `TITLE_ID`, just a distinct string. */
const TITLE_ID = 'budget-create-dialog-title';

interface Props {
  onClose: () => void;
}

/**
 * Desktop "+ New Budget" dialog — the same shape as `expenses/desktop/
 * CreateDialog.tsx` (read that file's header first), hosting `BudgetCreateForm`
 * unchanged (`onDone={onClose}`) rather than reimplementing the form. Sized
 * with a definite `height` for the identical structural reason
 * `CreateDialog` gives for `ExpenseCreateForm`/`IncomeCreateForm`:
 * `BudgetCreateForm` is a whole screen (`SafeAreaView(flex:1) ->
 * KeyboardAvoidingView(flex:1) -> ScrollView(flex:1) + footer`), not a plain
 * card, and that `flex:1` chain only means anything under a DEFINITE-height
 * ancestor.
 *
 * **Deliberately no "discard changes?" confirmation on close** — the exact
 * same reasoning `CreateDialog`'s file header gives: opening this dialog IS
 * the act of starting a create, there is no untouched "view" state to
 * compare against, and `BudgetCreateForm` reports no dirty flag to gate a
 * confirmation on.
 */
export function BudgetCreateDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} aria-labelledby={TITLE_ID}>
      {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
          `ExpenseDialog.tsx`'s file-level comment for why it must carry no
          tabindex at all. */}
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
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
              {t('budgets.createBudget')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <BudgetCreateForm onDone={onClose} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    // A definite height, not a shrink-to-fit `maxHeight` — see the
    // file-level comment for why.
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
});
