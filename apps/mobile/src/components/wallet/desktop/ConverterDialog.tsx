import { Modal, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ConverterView } from '@/components/wallet/ConverterView';

interface Props {
  onClose: () => void;
}

/**
 * Desktop currency-converter dialog, opened from the rail's quick-links card.
 * Sibling of `ExchangeDialog`/`TransferDialog`/`SetBalanceDialog` and built the
 * same way — read `ExpenseDialog.tsx`'s file-level comment first for the RN
 * `Modal` + raw un-tabbable `<div>` scrim reasoning.
 *
 * **This is the entry point that did not exist anywhere.** `/converter` was
 * reachable from exactly one place in the whole app — the mobile quick-action
 * strip — and the desktop dashboard retired that strip, so on web the
 * converter had no route to it at all.
 *
 * ## No header title, and no history button
 *
 * `ConverterView` draws its own `converter.title` heading, so a header title
 * would sit above a duplicate of itself — the `SetBalanceDialog` precedent, for
 * the same reason. The accessible name therefore comes from `aria-label` rather
 * than `aria-labelledby`, since there is no header text node to point at. And
 * unlike its two siblings this view has no `Stack.Screen` header on the route
 * either (checked — the route declares only a title in `app/_layout.tsx`), so
 * there is no affordance to reproduce: nothing is dropped by hosting it here.
 *
 * ## Narrower and shorter than the other two
 *
 * It is a calculator, not a form: two currency pickers, one amount, one
 * result. `maxWidth` 560 rather than 680, and a `maxHeight` cap on top of the
 * `height: '85%'` so it does not stretch to a tall panel of empty space on a
 * large monitor. The `height` itself stays definite (the view's root is
 * `flex: 1`; see `ExchangeDialog`'s note), `maxHeight` only bounds it.
 */
export function ConverterDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      aria-label={t('converter.title')}
    >
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
          {/* Close only — the view supplies the title. */}
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ConverterView />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 560,
    height: '85%' as const,
    maxHeight: 640,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  // No border under this one: the view draws its own heading immediately
  // below, and a rule between a bare close button and that heading would read
  // as an empty title bar (`SetBalanceDialog`'s own note).
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
});
