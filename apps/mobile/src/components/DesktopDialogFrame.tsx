import type { ReactNode } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  title: string;
  /** Only one instance of each dialog is mounted at a time, so each dialog passes a fixed id. */
  titleId: string;
  onRequestClose: () => void;
  /** Max width in px; the panel is `90%` of the window up to this. Default 560. */
  width?: number;
  /** `'auto'` sizes to content (capped at 85%; only for a body that is NOT a `flex: 1` screen); anything else is a definite height. Default `'85%'`. */
  height?: 'auto' | number | string;
  /** Rendered between the title and the close button (e.g. a history shortcut). */
  headerExtra?: ReactNode;
  /** Rendered below the hosted body in a divider-topped row (the form's Save button). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The shared frame for NEW desktop dialogs (ABA-646). It is the block
 * `TransferDialog`, `ExchangeDialog` and `ExpenseDialog` each hand-copied: an RN
 * `Modal` (role, aria-modal, Esc, focus trap), a raw un-tabbable `<div>` scrim
 * (a `Pressable` would emit a `tabIndex` and become the focus trap's first
 * target), `theme.colors.overlay`, a `surface` panel, a header with a labelled
 * title and a close button.
 *
 * The existing dialogs are deliberately NOT retrofitted onto it - that would
 * move shipped pixels for no user-visible gain.
 *
 * Web only: the raw `<div>` is why this file is imported solely from
 * `desktop/*` components, which are themselves reached only from `.web.tsx`
 * deciders. Never import it from a phone view.
 *
 * `height` is definite by default because the hosted views' roots are
 * `flex: 1` `KeyboardAwareScreen`s, which collapse inside an auto-height panel.
 */
export function DesktopDialogFrame({
  title,
  titleId,
  onRequestClose,
  width = 560,
  height = '85%',
  headerExtra,
  footer,
  children,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const auto = height === 'auto';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onRequestClose} aria-labelledby={titleId}>
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onRequestClose();
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
        <View
          style={[
            styles.panel,
            { maxWidth: width },
            auto ? { maxHeight: '85%' as const } : { height: height as number | `${number}%` },
          ]}
        >
          <View style={styles.header}>
            <Text nativeID={titleId} style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {headerExtra}
            <Pressable
              onPress={onRequestClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <View style={auto ? styles.bodyAuto : styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
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
  body: { flex: 1, minHeight: 0 },
  bodyAuto: { flexShrink: 1, minHeight: 0 },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
});
