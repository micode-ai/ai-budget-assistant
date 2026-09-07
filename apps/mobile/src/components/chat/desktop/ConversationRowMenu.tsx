import { useWindowDimensions, Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ConversationMenuItem } from '@/features/chat/chatLayout';

interface Props {
  /** Viewport coordinates — the "⋯" button's own `getBoundingClientRect()`
   *  for a click/keyboard activation, or the row's `clientX`/`clientY` for a
   *  right-click. Clamped below so an anchor near the window's edge never
   *  pushes the menu off-screen. */
  anchor: { x: number; y: number };
  /**
   * Rendered exactly as given — deciding what a row's menu holds (whether
   * that includes Rename/Delete, and the Pin/Unpin label+icon pair) is
   * `conversationMenuItems`'s job (`chatLayout.ts`), not this component's.
   * This is Decision 1/Step 3's rule made literal: ownership is decided
   * once, upstream, and this popover only ever renders what it is handed.
   */
  items: ConversationMenuItem[];
  onClose: () => void;
  onSelect: (item: ConversationMenuItem) => void;
}

// Both numbers are the design's own ("The row menu (desktop)" — "width 176,
// viewport-clamped both axes"). The height is the same worst-case estimate
// `RowContextMenu.tsx` uses for its own 3-items-plus-a-divider shape — this
// menu never exceeds that shape either (Pin/Unpin, Rename, a divider,
// Delete), so the same generous estimate applies without a second
// measurement pass.
const MENU_WIDTH = 176;
const MENU_ESTIMATED_HEIGHT = 168;
const VIEWPORT_MARGIN = 8;

/**
 * The desktop conversation rail's row menu — a chat SIBLING of
 * `expenses/desktop/RowContextMenu.tsx`, built on the same pattern (RN
 * `Modal`, a raw `<div>` scrim with no `tabindex`, a viewport-clamped
 * anchored popover, `accessibilityRole="menuitem"` items) but deliberately
 * NOT that file: the ledger's menu is hardcoded to three expense actions
 * gated by a ROLE (`canEdit`); this rail's gate is OWNERSHIP, and its item
 * set varies per row (Global Constraints — "Must not generalise
 * `RowContextMenu.tsx`"). This is a second, sibling implementation of the
 * same shape, not a shared component — reusing the file would risk the
 * shipped, product-approved ledger for a gate it does not have.
 *
 * The scrim is a raw, tabindex-less `<div>` for the identical reason
 * `RowContextMenu.tsx`/`ExpenseDialog.tsx` use one instead of a themed
 * `Pressable`: react-native-web gives every `Pressable` some `tabindex`,
 * which would make a touchable scrim a valid `.focus()` target and steal
 * the `Modal`'s focus trap away from the menu's own first item.
 */
export function ConversationRowMenu({ anchor, items, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width, height } = useWindowDimensions();

  const left = clamp(anchor.x, VIEWPORT_MARGIN, width - MENU_WIDTH - VIEWPORT_MARGIN);
  const top = clamp(anchor.y, VIEWPORT_MARGIN, height - MENU_ESTIMATED_HEIGHT - VIEWPORT_MARGIN);

  const act = (item: ConversationMenuItem) => () => {
    onClose();
    onSelect(item);
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onContextMenu={(e) => {
          // A second right-click anywhere else (another row, the empty rail)
          // closes this menu rather than stacking a browser context menu on
          // top of it — same behaviour as `RowContextMenu`'s own handler.
          e.preventDefault();
          onClose();
        }}
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <View style={[styles.menu, { position: 'absolute', top, left, width: MENU_WIDTH }]}>
          {items.map((item) => (
            <View key={item.action}>
              {item.dividerBefore && <View style={styles.divider} />}
              <Pressable style={styles.item} onPress={act(item)} accessibilityRole="menuitem">
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={item.destructive ? theme.colors.danger : theme.colors.primary}
                />
                <Text style={[styles.itemText, item.destructive && { color: theme.colors.danger }]}>
                  {t(item.labelKey)}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </div>
    </Modal>
  );
}

function clamp(value: number, min: number, max: number): number {
  // `max` can legitimately be smaller than `min` on a tiny/very narrow
  // window — favour keeping the menu fully on-screen over honouring the
  // exact anchor in that edge case (identical to `RowContextMenu`'s own).
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
