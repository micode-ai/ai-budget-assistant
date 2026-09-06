import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * The desktop bulk-action bar: chrome only.
 *
 * **In normal flow, immediately above the content it acts on** — that is the
 * whole rule, and it is the shape the transactions list already shipped
 * (`ExpensesDesktop` renders it after `SummaryStrip`, gated on the selection).
 *
 * It is deliberately **not sticky**. A settings screen renders inside a pane,
 * and a pane has no scroller of its own — the shell owns the page scroll — so
 * `position: sticky` there anchors to the *page* and the bar would hover over
 * whatever the pane happens to be showing, permanently, on a screen that is not
 * short. Placing it above the list removes the problem instead of working
 * around it: the bar is never behind the rest of the screen at all.
 *
 * **Key-neutral by construction.** The count label arrives already translated
 * and the buttons arrive as children, so `expenses.bulkSelected` and
 * `merchants.selected` both stay at their own call sites and this component
 * mints no i18n keys of its own. Button styling likewise belongs to the screen:
 * a ledger's bulk actions are peer chips, a merge is one primary action, and
 * flattening that into a shared button style would be a design decision taken
 * by an extraction.
 *
 * **The phone's docked bar must NOT be routed through this.** A docked bar
 * relies on a full-height `flex: 1` scroller as its sibling — the very thing
 * that is inert inside a pane, and therefore the cause of the regression this
 * component exists to fix. The platform fork belongs in the screen that has
 * both renderings, not in here: a shared component that quietly flattened the
 * docked bar into normal flow would repeat the regression on the platform that
 * never had it.
 *
 * `style` is for **placement only** (margins). The box itself — background,
 * radius, border, shadow, padding, row layout — is this component's, because a
 * bar that looks different on each screen is what the extraction is preventing.
 */
type ClearProps =
  | {
      /** Renders the clear (X) button, which exits the screen's selection mode. */
      onClear: () => void;
      /**
       * Accessibility label for that button. Required alongside `onClear`: it is
       * icon-only, so without one it is unreachable by a screen reader.
       */
      clearAccessibilityLabel: string;
    }
  | { onClear?: undefined; clearAccessibilityLabel?: undefined };

type Props = ClearProps & {
  /** Already-translated count label, e.g. `t('expenses.bulkSelected', { count })`. */
  label: string;
  /** Placement only — margins that position the bar within its screen. */
  style?: StyleProp<ViewStyle>;
  /** The screen's own action buttons, or a busy indicator in their place. */
  children?: React.ReactNode;
};

export function BulkActionBar({
  label,
  onClear,
  clearAccessibilityLabel,
  style,
  children,
}: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={[styles.bar, style]}>
      <View style={styles.left}>
        {onClear && (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={clearAccessibilityLabel}
            style={styles.clearButton}
          >
            <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
          </Pressable>
        )}
        <Text style={styles.count}>{label}</Text>
      </View>

      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  left: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  clearButton: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  count: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
});
