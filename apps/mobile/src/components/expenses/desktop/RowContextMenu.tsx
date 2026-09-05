import { useWindowDimensions, Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  /** Viewport coordinates (`clientX`/`clientY` for a right-click, or the
   *  "⋯" button's own bounding rect for a click/keyboard activation — see
   *  `TransactionTable.tsx`'s `handleRowContextMenu`/`handleMenuButtonPress`).
   *  Clamped below so an anchor near the window's edge never pushes the menu
   *  off-screen. */
  anchor: { x: number; y: number };
  /**
   * Gates ALL THREE items, not just Duplicate/Delete (fix round 1) — Edit no
   * longer means "navigate to a view, read-only for a viewer" the way
   * mobile's identically-named sheet item does; it means "open `ExpenseDialog`
   * already in edit mode" (see `ExpensesDesktop`'s `onEdit` wiring), which a
   * viewer must never reach, or the label "Edit" would open something that
   * cannot actually save. In practice `canEdit` is already `false` for every
   * caller that could render this component at all — `TransactionTable.tsx`
   * gates the "⋯" button and the row's `onContextMenu` behind the SAME
   * `canEdit`, so this menu never mounts for a viewer in the first place.
   * Gating Edit here too is defense-in-depth/consistency with its two
   * siblings, not the only thing standing between a viewer and it. */
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const MENU_WIDTH = 176;
// No real measurement pass happens before the first paint (that would need a
// second render just to reposition), so this is a deliberately generous
// worst-case (all three items + a divider) — clamping against an overestimate
// can only ever leave a little extra margin, never actually push the menu
// off-screen the way an underestimate could.
const MENU_ESTIMATED_HEIGHT = 168;
const VIEWPORT_MARGIN = 8;

/**
 * The desktop equivalent of `TransactionActionSheet` (Step 3) — but built as
 * its own small anchored popover rather than reusing that component's
 * bottom-sheet presentation. `TransactionActionSheet` is hard-coded to slide
 * up from the bottom of the WHOLE screen (`justifyContent: 'flex-end'`,
 * `translateY` animation) — the right shape for a thumb reaching the bottom
 * of a phone, wrong for a menu that should appear next to the row a mouse or
 * keyboard just activated. Duplicate and Delete reuse `ExpensesDesktop`'s own
 * `handleDuplicate`/`handleDeleteFromList` — the exact same functions
 * mobile's sheet calls — never a second implementation of what either does.
 * Edit (fix round 1) is NOT a reuse of mobile's `handleEdit`: that navigates
 * to `/expense/[id]`, the very screen decision 4 replaced with `ExpenseDialog`,
 * so wiring this menu's Edit to it would have given a row two different
 * "open this" destinations depending on whether it was clicked or its menu
 * was opened. `ExpensesDesktop` instead opens the SAME dialog a row click
 * does, seeded straight into edit mode. "Select multiple" is dropped
 * entirely: the checkbox column already is that.
 *
 * Built on RN's own `<Modal>`, same as `ExpenseDialog.tsx` — free Esc-to-close
 * via `onRequestClose`, and a focus trap that (per that file's own comment,
 * verified by reading react-native-web's shipped source) returns focus to
 * whatever opened it. The scrim is a raw, tabindex-less `<div>` for the same
 * reason `ExpenseDialog.tsx` uses one instead of a themed `Pressable`: a
 * `Pressable` always emits SOME `tabindex` attribute, which would make it a
 * valid `.focus()` target and steal the trap's initial focus away from the
 * menu's own first item.
 */
export function RowContextMenu({ anchor, canEdit, onClose, onEdit, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width, height } = useWindowDimensions();

  const left = clamp(anchor.x, VIEWPORT_MARGIN, width - MENU_WIDTH - VIEWPORT_MARGIN);
  const top = clamp(anchor.y, VIEWPORT_MARGIN, height - MENU_ESTIMATED_HEIGHT - VIEWPORT_MARGIN);

  const act = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onContextMenu={(e) => {
          // A second right-click anywhere else on the page (e.g. on another
          // row) should close this menu rather than stack a browser context
          // menu on top of it.
          e.preventDefault();
          onClose();
        }}
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <View style={[styles.menu, { position: 'absolute', top, left, width: MENU_WIDTH }]}>
          {canEdit && (
            <Pressable style={styles.item} onPress={act(onEdit)} accessibilityRole="menuitem">
              <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.itemText}>{t('common.edit')}</Text>
            </Pressable>
          )}

          {canEdit && (
            <Pressable style={styles.item} onPress={act(onDuplicate)} accessibilityRole="menuitem">
              <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.itemText}>{t('common.duplicate')}</Text>
            </Pressable>
          )}

          {canEdit && (
            <>
              <View style={styles.divider} />
              <Pressable style={styles.item} onPress={act(onDelete)} accessibilityRole="menuitem">
                <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                <Text style={[styles.itemText, { color: theme.colors.danger }]}>{t('common.delete')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </div>
    </Modal>
  );
}

function clamp(value: number, min: number, max: number): number {
  // `max` can legitimately be smaller than `min` on a tiny/very narrow
  // window — favour keeping the menu fully on-screen horizontally/
  // vertically over honouring the exact anchor in that edge case.
  return Math.min(Math.max(value, min), Math.max(min, max));
}

const createStyles = (theme: Theme) => ({
  menu: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[1],
    ...theme.shadows.lg,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  itemText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[1],
    marginHorizontal: theme.spacing[2],
  },
});
