import { Modal, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ChangeEmailView } from './ChangeEmailView';

interface Props {
  onClose: () => void;
}

/**
 * Desktop "change your email address" dialog, opened from the email row of the
 * profile pane. A sibling of `SetBalanceDialog`/`CreateDialog`/`ExpenseDialog`
 * and built the same way — read `ExpenseDialog.tsx`'s header comment first:
 * RN's own `Modal` for `role="dialog"`, `aria-modal`, `Esc` and the focus trap
 * and restoration, a raw un-tabbable `<div>` scrim rather than a `Pressable`
 * (which always emits a tabindex and would become the trap's first target),
 * and `theme.colors.overlay`.
 *
 * It hosts `ChangeEmailView` — the whole body of `app/settings/change-email.tsx`,
 * moved to `src/` unchanged — so changing an email is defined in one place and
 * the desktop layer cannot drift from the phone on what the flow does.
 *
 * ## Why this is a dialog at all
 *
 * In a pane there is no back. The profile pane sits inside the settings shell
 * with the left nav beside it; pushing a full-page route from there would swap
 * the entire shell for a two-field form whose only way out is the browser's
 * back button — which the design language treats as an answer of last resort,
 * not an affordance. So the flow becomes a layer over the pane that owns its
 * own dismissal.
 *
 * ## Closing cannot lose a half-finished change
 *
 * This is the one hazard in the screen, and it is answered by where the state
 * lives rather than by anything here. Between step 1 and step 2 the flow is
 * carried by a record in `secureStorage` with a 30-minute life, written the
 * moment the API accepts the request and cleared only by a confirmed change, by
 * an expiry, or by the user pressing "Resend", which means start over. Nothing
 * clears it on unmount. So a close is exactly what an app restart is: the next
 * open re-reads the record and lands back on the code field, with the pending
 * address restored.
 *
 * That resume depends on the view being MOUNTED afresh, which is why
 * `ProfileSettings` renders this dialog conditionally rather than holding it
 * mounted behind `visible={false}` — the mount effect is the thing that reads
 * the record back. (Keeping it mounted would preserve the state too, in React
 * this time; both work. What must never be added is a clear-on-close.)
 *
 * There is deliberately no "discard?" confirmation on the way out, unlike
 * `ExpenseDialog`'s: there is nothing to discard. A half-typed step 1 is worth
 * nothing — no request has been sent — and a step 2 in progress survives the
 * close intact.
 *
 * ## No title of its own
 *
 * `ChangeEmailView` renders its own heading and that heading tracks the step
 * (`step1Title` becomes `step2Title`), so a fixed dialog title would contradict
 * the body the moment the code is sent, and a tracking one would need a second
 * copy of the step state. Same situation and same answer as `SetBalanceDialog`:
 * the header holds the close button alone, and the accessible name comes from
 * `aria-label` rather than `aria-labelledby`, since there is no header text
 * node to point at. (`app/_layout.tsx` gives the route a stack title, but it
 * asks for `changeEmail.title`, which does not exist — the key is
 * `settings.changeEmail.title`, used here. The route's own header is a
 * pre-existing bug, untouched by this work.)
 */
export function ChangeEmailDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      aria-label={t('settings.changeEmail.title')}
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

          <ChangeEmailView onDone={onClose} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 520,
    /**
     * A DEFINITE height, for `CreateDialog.tsx`'s reason: `ChangeEmailView`'s
     * root is a `SafeAreaView` styled `flex: 1` wrapping a `flex: 1`
     * `KeyboardAwareScreen`, and it renders a `flex: 1` spinner while it reads
     * the pending record. `flex: 1` resolves against a definite-height
     * ancestor; inside an auto-height panel those children would collapse
     * toward zero and the form would sit as a sliver under the close button.
     *
     * A number rather than `SetBalanceDialog`'s `'85%'` because this form is
     * short and fixed — an icon, a heading and at most two fields — so a
     * percentage of a tall desktop viewport would draw a mostly empty box. 520
     * fits step 1 in every locale with room to spare, and the view scrolls if a
     * translation ever needs more. `maxHeight` still caps it on a short window,
     * where the percentage is the smaller of the two.
     */
    height: 520,
    maxHeight: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  // No border under this one: the view draws its own heading below it, and a
  // rule between a bare close button and that heading reads as an empty title
  // bar.
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
