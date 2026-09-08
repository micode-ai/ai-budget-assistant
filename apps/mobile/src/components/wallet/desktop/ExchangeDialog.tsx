import { Modal, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ExchangeView } from '@/components/wallet/ExchangeView';

/** Only one instance is mounted at a time (`DashboardDesktop` renders it
 *  conditionally from a single dialog slot), so a fixed id is safe. */
const TITLE_ID = 'exchange-dialog-title';

interface Props {
  onClose: () => void;
}

/**
 * Desktop "record a currency exchange" dialog, opened from the rail's
 * quick-links card. A sibling of `SetBalanceDialog`/`CreateDialog` and built
 * the same way — read `ExpenseDialog.tsx`'s file-level comment first: RN's own
 * `Modal` for role/aria/Esc/focus-trap/focus-restoration, a raw, deliberately
 * un-tabbable `<div>` scrim rather than a `Pressable` (a `Pressable` always
 * emits a tabindex and would become the trap's first focus target ahead of the
 * real content), `theme.colors.overlay`, and `aria-labelledby` pointing at the
 * header title.
 *
 * It hosts `ExchangeView` — the whole body of `app/wallet/exchange/index.tsx`,
 * moved to `src/` unchanged — so recording an exchange is defined in one place
 * and the desktop layer cannot drift from the phone on what it does.
 *
 * ## The header carries the route's own history shortcut
 *
 * The route's `Stack.Screen` puts a "all exchanges" clock icon in its header,
 * and a `Stack.Screen` cannot come along into a dialog (it would configure
 * whichever route is underneath). Dropping it would mean this dialog hosts the
 * screen minus one affordance — the thing `ExpenseDialog`'s own comment warns
 * about, since a dialog replaced the navigation rather than sitting beside it.
 * So it is reproduced here, and it closes the dialog before navigating: the
 * history IS a different screen, and following it is the user deliberately
 * leaving, not something to bury an overlay on top of.
 *
 * ## Why a definite height
 *
 * `ExchangeView`'s root is `SafeAreaView(flex: 1)` wrapping a `flex: 1`
 * scroller, which needs a definite-height ancestor — an auto-height flex
 * container sizes itself from its children's hypothetical sizes rather than
 * handing free space to a `flex: 1` descendant, so the fields would collapse.
 * Same reasoning, and the same `height: '85%'`, as `CreateDialog` and
 * `SetBalanceDialog`; `'85%'` is itself definite because the scrim is a
 * `position: fixed` box with all four offsets at 0.
 *
 * ## No "discard changes?" confirmation
 *
 * Matching `CreateDialog`: the view exposes no dirty-state signal, and opening
 * this dialog IS the act of starting an entry, so there is no untouched state
 * to compare against. A stray scrim click can lose a half-filled form — the
 * accepted trade-off there, and the same one here.
 */
export function ExchangeDialog({ onClose }: Props) {
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
              {t('exchange.title')}
            </Text>
            <Pressable
              onPress={() => {
                // Close first: the history is a full page, and leaving a modal
                // mounted over a navigation it just triggered is how a dialog
                // ends up floating over an unrelated screen.
                onClose();
                router.push('/wallet/exchanges');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('exchange.allExchanges')}
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

          <ExchangeView onSaved={onClose} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    // Definite, not `maxHeight` — see the file comment.
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
