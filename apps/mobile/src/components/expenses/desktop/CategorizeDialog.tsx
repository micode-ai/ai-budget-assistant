import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { CategorizeReview } from '@/components/categorize/CategorizeReview';

const TITLE_ID = 'categorize-dialog-title';

interface Props {
  onClose: () => void;
}

/**
 * Desktop "Categorize" dialog, opened from the uncategorized banner above
 * `SummaryStrip`. Same chrome as `CreateDialog.tsx` — read that file's header
 * comment first: RN's own `Modal`, a raw, deliberately un-tabbable `<div>`
 * scrim (never a `Pressable`, which would emit a tabindex and beat the real
 * content to the focus trap's first stop), `theme.colors.overlay`, and
 * `aria-labelledby` pointing at the header title via `nativeID`.
 *
 * The panel is a definite `height`, not a shrink-to-fit `maxHeight`, for the
 * same reason `CreateDialog` uses one: `CategorizeReview`'s root is a plain
 * `flex: 1` View with its OWN internal `ScrollView` and a pinned footer
 * sibling — it needs an ancestor with a definite height to grow into, not a
 * second auto-height `ScrollView` wrapped around it. It is rendered directly
 * as the panel's second flex child, unwrapped, exactly as `CreateDialog`
 * hosts `ExpenseCreateForm`/`IncomeCreateForm`.
 */
export function CategorizeDialog({ onClose }: Props) {
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
              {t('categorize.title')}
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

          <CategorizeReview onDone={onClose} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 760,
    // A definite height, not a shrink-to-fit `maxHeight` — see the file-level
    // comment for why `CategorizeReview` needs one.
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
