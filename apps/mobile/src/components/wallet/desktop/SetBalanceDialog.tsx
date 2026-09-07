import { useState } from 'react';
import { Modal, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SetBalanceView } from '@/components/wallet/SetBalanceView';

interface Props {
  onClose: () => void;
}

/**
 * Desktop "set your wallet balance" dialog, opened from the setup checklist.
 * A sibling of `CreateDialog`/`BudgetCreateDialog`/`ReceiptDialog` and built
 * the same way (read `ExpenseDialog.tsx`'s header comment first): RN's own
 * `Modal` for role/aria/Esc/focus-trap, a raw un-tabbable `<div>` scrim,
 * `theme.colors.overlay`.
 *
 * It hosts `SetBalanceView` — the whole body of `app/wallet/set-balance.tsx`,
 * moved to `src/` unchanged — so setting a balance is defined in one place.
 *
 * Three things about that view forced decisions here rather than being
 * absorbed silently. All three are consequences of it being a genuine screen
 * with a list, not a single-purpose form.
 *
 * ## 1. This dialog has NO title of its own, deliberately
 *
 * `SetBalanceView` renders its own heading, and that heading **tracks edit
 * mode** — `wallet.setInitialBalance` becomes `wallet.editInitialBalance` when
 * the pencil is tapped. A dialog header with a fixed title would therefore sit
 * above a body that contradicts it the moment the user edits a row, and a
 * header that tried to track edit mode would need its own copy of the "does
 * this id resolve to a live balance" lookup — a second source of truth about
 * the same state.
 *
 * So the header holds the close button alone, and the view's own heading is
 * the single visible title. The accessible name comes from `aria-label` rather
 * than `aria-labelledby`, since there is no header text node to point at.
 * (Unlike the voice and receipt routes there is no `headerRight` hiding in
 * `app/_layout.tsx` for this one — checked; its `Stack.Screen` declares only a
 * title, which the view supersedes.)
 *
 * ## 2. It does not close on save, and that is the considered choice
 *
 * `SetBalanceView.onDone` fires only from Cancel in edit mode — a successful
 * save shows an alert and stays open on its balance list, clearing the field so
 * another currency can be added. That is the route's behaviour and it is
 * deliberate: an account can hold several currencies and entering them one
 * after another is the normal case.
 *
 * An optional `onSaved` could have been added to close on the first save. It
 * was not, for the same reason `ReceiptDialog` and `VoiceDialog` do not close
 * on save either: all three are multi-entry screens, and closing after the
 * first item would delete a real affordance to buy a completion signal nothing
 * actually needs. Nothing needs it because the checklist behind the dialog
 * ticks itself — its wallet step is `walletSummary.length > 0`, read live from
 * the store — so by the time the user closes, the step is already ticked. The
 * dashboard comes alive behind the dialog exactly as it does for the first-run
 * panel.
 *
 * ## 3. Edit mode is route state on the route, and dialog state here
 *
 * The view is a controlled pair (`editId` + `onEditIdChange`) because on the
 * route the pencil calls `router.setParams({ editId })`, keeping the URL
 * authoritative and deep links working. A dialog has no route params, so it
 * holds the id in `useState`. Closing discards it, which is correct: reopening
 * should land on the create form, not resume someone's abandoned edit.
 *
 * **A known, pre-existing hazard this dialog must not worsen:** a wallet pull
 * landing mid-edit overwrites the amount being typed, because the view's reset
 * effect is keyed on the balance object's identity. It is edit-mode only and
 * unlikely here — the dashboard does not call `loadWallet()` on mount, and
 * nothing added here calls it either. Do not introduce a refresh on open.
 */
export function SetBalanceDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [editId, setEditId] = useState('');

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      aria-label={t('wallet.setInitialBalance')}
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
          {/* Close only — the view supplies the title. See section 1 above. */}
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

          <SetBalanceView editId={editId} onEditIdChange={setEditId} onDone={onClose} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    // A definite height, not `ExpenseDialog`'s `maxHeight` — see
    // `CreateDialog.tsx`'s file comment: `SetBalanceView`'s root is a
    // `SafeAreaView(flex:1)` wrapping a `flex: 1` scroller, which needs a
    // definite-height ancestor rather than a second auto-height `ScrollView`.
    height: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  // No border under this one: the view draws its own heading immediately
  // below, and a rule between a bare close button and that heading would
  // read as an empty title bar.
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
