import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  ExpenseCreateForm,
  type ExpenseCreatePrefill,
} from '@/components/expenses/create/ExpenseCreateForm';
import { IncomeCreateForm } from '@/components/income/create/IncomeCreateForm';

/** Only one instance of this dialog is ever mounted at a time (`ExpensesDesktop`
 *  conditionally renders it from a single `createKind` slot, and the "+"
 *  buttons that open it are themselves unreachable while `ExpenseDialog` is
 *  open, since that dialog's scrim covers the whole screen), so a fixed id is
 *  safe here too — same reasoning as `ExpenseDialog.tsx`'s `TITLE_ID`, just a
 *  distinct string so the two are never confused if a future change ever did
 *  let both exist in the DOM at once. */
const TITLE_ID = 'create-dialog-title';

interface Props {
  kind: 'expense' | 'income';
  onClose: () => void;
  /**
   * Seeds the expense form's fields, exactly as the route's
   * `useLocalSearchParams` did for every existing hand-off into
   * `/expense/new` (duplicate a row, "record repayment", "lend money", and —
   * the reason this prop exists — the receipt scanner's "Edit" button).
   *
   * Ignored for `kind: 'income'`: `IncomeCreateForm` takes its own separate
   * prefill type and nothing hands off into it yet, so accepting one here
   * would be a parameter no call site can produce.
   */
  initial?: ExpenseCreatePrefill;
}

/**
 * Desktop "Add Expense" / "Add Income" dialog — decisions 4 and 5 extended
 * from viewing a row to creating one. A sibling of `ExpenseDialog.tsx`, built
 * the same way and for the same reasons (read that file's header comment
 * first): RN's own `Modal` (role="dialog", aria-modal, Esc, focus trap and
 * restoration — all verified against react-native-web's shipped source, not
 * assumed), a raw, deliberately un-tabbable `<div>` scrim rather than a
 * `Pressable` (a `Pressable` always emits a tabindex and would become the
 * trap's first focus target ahead of the real content), `theme.colors.overlay`,
 * and `aria-labelledby` pointing at the header title via `nativeID`.
 *
 * It hosts whichever of `ExpenseCreateForm`/`IncomeCreateForm` matches `kind`,
 * with `onDone={onClose}` — the same forms `app/expense/new.tsx` and
 * `app/income/new.tsx` already render for mobile, unmodified, so creating a
 * transaction is defined in exactly one place and desktop cannot drift from
 * mobile on what "save" does. Neither `onOpenVoice` nor `onOpenReceipt` is
 * passed to the income form: both navigate to a full-screen capture route,
 * and doing that out from under an open dialog would either bury the dialog
 * behind the new screen or (via that screen's own back-navigation) dismiss
 * the dialog while a half-filled form was still sitting in it. Omitting both
 * is enough — `IncomeCreateForm` already gates its whole capture row on
 * `onOpenVoice || onOpenReceipt`, so passing neither renders no row at all,
 * exactly the mobile-route behaviour this dialog does NOT need to reproduce.
 *
 * **Why this panel is a definite height, not `ExpenseDialog`'s shrink-to-fit
 * `maxHeight`.** `ExpenseDialog` hosts plain, non-scrolling cards inside its
 * OWN `ScrollView`, so letting the panel shrink to content (up to a cap) and
 * scroll only when it overflows is correct there. These two forms are not
 * cards — each is a full screen with its OWN internal layout: a `ScrollView`
 * with `flex: 1` for the fields, followed by a sibling footer (the Save
 * button, and for income optionally the voice/receipt row) that is meant to
 * stay pinned below it. That `flex: 1` only means anything relative to an
 * ancestor with a DEFINITE height — nesting the whole form inside a SECOND,
 * auto-height `ScrollView` (the way `ExpenseDialog` wraps its cards) would
 * hand the form's own `ScrollView` no space to grow into: an auto-sized flex
 * container computes its height from its children's hypothetical sizes, not
 * by handing out free space to `flex: 1` descendants, so the fields would
 * collapse toward zero height with the footer sitting immediately below the
 * header. Confirmed by reading both forms' root layout (`SafeAreaView` styled
 * `flex: 1` → `KeyboardAvoidingView` styled `flex: 1` → `ScrollView` styled
 * `flex: 1` + a footer `View` as its NEXT sibling, not its child), not
 * assumed. So this panel is given a real `height` (not `maxHeight`) — itself
 * definite because the scrim is `position: 'fixed'` with all four offsets at
 * 0, which is a real viewport-sized box — and the form is rendered directly
 * as the panel's second flex child, with no extra `ScrollView` wrapper. Its
 * own root `flex: 1` then fills exactly the space left under the header,
 * scrolling internally with the footer pinned at the bottom — the same
 * layout it already has when routed full-screen on mobile, just windowed
 * into a dialog instead of the whole viewport. A short, mostly-empty form
 * (a bare income entry, say) will show blank space above a bottom-pinned
 * footer rather than shrink-wrapping — that is the SAME thing that already
 * happens today on the routed screen and is not a regression introduced by
 * hosting it in a dialog.
 *
 * **Deliberately no "discard changes?" confirmation on close**, unlike
 * `ExpenseDialog.requestClose`. That guard is gated on `ExpenseDialog`'s own
 * `isEditing` toggle — an explicit, observable signal that the user chose to
 * start changing EXISTING data. This dialog has no such signal: `onDone` is
 * the only callback either create form exposes (per the fixed `{ initial?,
 * onDone }` / `{ initial?, onDone, onOpenVoice?, onOpenReceipt? }` shapes),
 * neither form reports whether any field was actually touched, and opening
 * this dialog IS the act of starting a create — there's no untouched "view"
 * state to compare against the way there is for an existing row. Confirming
 * on every close (scrim click, Esc, or the header's X) regardless of whether
 * anything was typed would be more interruptive than useful, and building a
 * real dirty-tracking signal would mean adding a prop to forms that Tasks 1
 * and 2 shipped with a fixed, already-consumed interface. The accepted
 * trade-off is a stray click on the scrim can lose a half-filled NEW entry —
 * lower stakes than `ExpenseDialog`'s case (an edit to data that already
 * existed before the dialog opened), but a real one; worth reconsidering if
 * either form ever grows a dirty-state signal for another reason.
 *
 * **`CreateCategoryModal`** (rendered by both create forms) is itself an RN
 * `Modal`, so opening it from within this one nests a second `Modal` inside
 * the first. Neither form renders it today when hosted by `ExpenseDetailsCard`/
 * `IncomeDetailsCard` (`ExpenseDialog`'s own content), so this is a genuinely
 * new combination on desktop. Left unverified in a browser — see the task
 * report — but not expected to conflict: RN Web's `Modal` portals its content
 * independent of where it's declared in the React tree, so it doesn't matter
 * that the declaration site is nested inside this dialog's own `Modal`.
 */
export function CreateDialog({ kind, onClose, initial }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const title = t(kind === 'expense' ? 'nav.newExpense' : 'nav.newIncome');

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
              {title}
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

          {kind === 'expense' ? (
            <ExpenseCreateForm initial={initial} onDone={onClose} />
          ) : (
            <IncomeCreateForm onDone={onClose} />
          )}
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
    // file-level comment for why these two forms need one.
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
