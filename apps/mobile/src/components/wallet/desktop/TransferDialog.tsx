import { Modal, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { TransferCreateView } from '@/components/wallet/TransferCreateView';

/** Only one instance is mounted at a time (`DashboardDesktop` renders it
 *  conditionally from a single dialog slot), so a fixed id is safe. */
const TITLE_ID = 'transfer-dialog-title';

interface Props {
  onClose: () => void;
}

/**
 * Desktop "move money between accounts" dialog, opened from the rail's
 * quick-links card. Twin of `ExchangeDialog` — read that file's comment for the
 * shared reasoning (RN `Modal` for role/aria/Esc/focus-trap, raw un-tabbable
 * `<div>` scrim, `theme.colors.overlay`, a definite `height` because the hosted
 * view's root is `flex: 1`, the route's `Stack.Screen` history shortcut
 * reproduced in this header, and no discard-changes confirmation).
 *
 * It hosts `TransferCreateView` — the whole body of `app/wallet/transfer.tsx`,
 * moved to `src/` unchanged — so a transfer is defined in one place.
 *
 * `onSaved` is what `useTransferForm` used to hardcode as `router.back()`.
 * Passing `onClose` here is the entire point of that change: back would
 * navigate the dashboard away, and on a first page load with no history it
 * would do nothing at all and leave a submitted form open.
 */
export function TransferDialog({ onClose }: Props) {
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
              {t('transfer.title')}
            </Text>
            <Pressable
              onPress={() => {
                // Close first — see `ExchangeDialog`'s note on the same button.
                onClose();
                router.push('/wallet/transfers');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('transfer.allTransfers')}
              style={styles.iconButton}
            >
              <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <TransferCreateView onSaved={onClose} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    height: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
