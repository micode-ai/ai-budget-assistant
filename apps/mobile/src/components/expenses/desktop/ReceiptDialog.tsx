import { useCallback, useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { ReceiptExpenseView } from '@/components/receipt/ReceiptExpenseView';
import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';

/** Only one instance of this dialog is ever mounted at a time (`DashboardDesktop`
 *  renders it from a single `captureDialog` slot), so a fixed id is safe — same
 *  reasoning as `ExpenseDialog.tsx`'s `TITLE_ID`, just a distinct string. */
const TITLE_ID = 'receipt-dialog-title';

interface Props {
  onClose: () => void;
  /**
   * "Edit" on the confirm card. The dashboard closes this dialog and opens the
   * manual-entry dialog with the same prefill the routed flow would have pushed
   * to `/expense/new`, so the hand-off never leaves the dashboard.
   */
  onEdit: (prefill: ExpenseCreatePrefill) => void;
}

/**
 * Desktop receipt-scan dialog. A sibling of `ExpenseDialog.tsx`/
 * `CreateDialog.tsx`/`StoryDialog.tsx`, built the same way and for the same
 * reasons (read `ExpenseDialog.tsx`'s header comment first): RN's own `Modal`
 * (role="dialog", aria-modal, Esc via `onRequestClose`, focus trap and
 * restoration), a raw, deliberately un-tabbable `<div>` scrim rather than a
 * `Pressable`, `theme.colors.overlay`, and `aria-labelledby` pointing at the
 * header title via `nativeID`.
 *
 * It hosts `ReceiptExpenseView` — the entire body of `app/expense/receipt.tsx`,
 * moved to `src/` unchanged — so a scan is defined in exactly one place and the
 * desktop layer cannot drift from mobile on what scanning does.
 *
 * ## The chrome this dialog had to reproduce, and where it was hiding
 *
 * `expense/receipt` is the one screen in this family whose `Stack.Screen` sets
 * **`headerShown: false`**: its `title` is declared in `app/_layout.tsx` and
 * never rendered, and its real header — close button, `receipt.title`, and an
 * **`AiUsageBadge`** — is drawn inside the route file. So checking
 * `_layout.tsx` for this route's chrome (the correct instinct, and where the
 * voice route genuinely keeps its badge) finds nothing, and a dialog built from
 * that reading silently drops the only place this AI-cost-bearing flow shows
 * the user their remaining quota. All three are reproduced in the header below.
 *
 * The badge is given `onNavigate={onClose}`, which the routed screens do not
 * pass: an RN `Modal` portals itself above the whole document, so tapping the
 * badge from inside a dialog would otherwise push `/subscription` *underneath*
 * a dialog that is still covering it.
 *
 * ## Closing
 *
 * Esc and a scrim click both close, via `onRequestClose` and the scrim's own
 * `onClick`. Both route through `requestClose`, which asks first when a
 * completed scan is sitting unsaved — `ReceiptExpenseView` reports exactly that
 * state through `onDirtyChange`, and it is the one state here that represents
 * work the user can see and that cost a real AI request to produce. Discarding
 * it on a stray click with no warning is the "closing must not lose work
 * silently" case; an in-flight scan is not, and is not guarded (see that prop's
 * own comment). Unlike `CreateDialog`, this dirty signal is real rather than
 * inferred from an editing toggle, so the confirmation is never spurious.
 *
 * **A definite `height`, not `ExpenseDialog`'s shrink-to-fit `maxHeight`** —
 * same reasoning as `CreateDialog.tsx`'s file comment: `ReceiptExpenseView`'s
 * root is a `KeyboardAwareScreen` (a `ScrollView`) styled `flex: 1`, which
 * needs a definite-height ancestor rather than a second auto-height
 * `ScrollView` wrapped around it. Rendered directly as the panel's second flex
 * child.
 */
export function ReceiptDialog({ onClose, onEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [hasUnsavedScan, setHasUnsavedScan] = useState(false);

  // Stable, so `ReceiptExpenseView`'s reporting effect depends on a value that
  // does not change every render — an inline arrow would re-run it on each
  // parent render, which is harmless here but is the shape that turns into a
  // render loop the moment the callback does more than one `setState`.
  const handleDirtyChange = useCallback((dirty: boolean) => setHasUnsavedScan(dirty), []);

  const requestClose = () => {
    if (hasUnsavedScan) {
      showAlert(
        t('expensesDesktop.discardChangesTitle'),
        t('expensesDesktop.discardChangesMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('expensesDesktop.discardChangesConfirm'),
            style: 'destructive',
            onPress: onClose,
          },
        ],
      );
      return;
    }
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={requestClose}
      aria-labelledby={TITLE_ID}
    >
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
              {t('receipt.title')}
            </Text>
            <View style={styles.headerActions}>
              {/* Carried across from the ROUTE FILE's own header, not from
                  `_layout.tsx` — see this file's header comment. */}
              <AiUsageBadge onNavigate={onClose} />
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

          <ReceiptExpenseView
            onDone={onClose}
            onEdit={onEdit}
            onDirtyChange={handleDirtyChange}
          />
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
    // file-level comment for why `ReceiptExpenseView` needs one.
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
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
});
