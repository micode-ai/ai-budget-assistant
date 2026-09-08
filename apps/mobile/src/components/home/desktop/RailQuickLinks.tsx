import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { RailQuickLink } from '@/features/dashboard/railQuickLinks';

interface RailQuickLinksProps {
  /**
   * Already resolved by `resolveRailQuickLinks` — visibility, order, viewer
   * and account-type filtering all decided before this component sees it.
   * Never empty when this renders; `DashboardRail` does not mount the card at
   * all for an empty list.
   */
  links: RailQuickLink[];
  /**
   * Hands a ROUTE up, exactly as the quick-action card and the setup checklist
   * do, so `resolveDialogAction`'s single table stays the only thing that
   * decides whether a route opens a dialog or navigates. Three of these six
   * destinations are forms and open over the dashboard; the three list screens
   * navigate.
   */
  onOpenRoute: (route: string) => void;
}

/**
 * The rail's second card: the quick actions that are not capture actions.
 *
 * This is the desktop answer to the phone's quick-action strip minus its four
 * capture icons — exchange, converter, transfers, subscriptions, shopping list,
 * purchase requests. The desktop dashboard retired that strip and replaced it
 * with `RailQuickActions`' fixed four, which left these five-to-six with no
 * shortcut and `/converter` with no entry point in the app at all.
 *
 * Presentational only: which rows exist, in what order, and who may see them
 * is `railQuickLinks.ts`'s decision — this file is layout, the way
 * `SetupChecklist` is layout over `resolveSetupSteps`. It shares that card's
 * shell (2px `borderLight` border, `spacing[4]` padding) so the rail reads as
 * one stack whichever cards happen to be present, and the same
 * `onHoverIn`/`onHoverOut` -> `surfaceSecondary` row hover as
 * `SetupChecklist`/`BudgetCard`/`FacetRail`.
 *
 * The heading reuses `settings.quickActionsTitle` — the exact label the
 * Settings screen that governs this list already carries, in all nine
 * locales — so the card names the thing the user would go and configure, and
 * this whole feature mints no new translation key.
 */
export function RailQuickLinks({ links, onOpenRoute }: RailQuickLinksProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{t('settings.quickActionsTitle')}</Text>
      <View style={styles.rows}>
        {links.map((link) => (
          <QuickLinkRow key={link.id} link={link} onOpenRoute={onOpenRoute} />
        ))}
      </View>
    </View>
  );
}

function QuickLinkRow({
  link,
  onOpenRoute,
}: {
  link: RailQuickLink;
  onOpenRoute: (route: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);

  const label = t(link.labelKey);

  return (
    <Pressable
      onPress={() => onOpenRoute(link.route)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, hovered ? styles.rowHovered : null]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={link.icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  // Same shell as the rail's quick-action card and the setup checklist, so the
  // rail begins the same way whichever cards are present.
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  // The card above it needs no heading (a filled "+ Expense" button says what
  // it is); six similar-looking rows do, or the rail reads as an unlabelled
  // list of links dropped between two cards that both explain themselves.
  heading: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  rows: {
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    // Horizontal padding and a radius exist for the hover tint: without them
    // it is a full-bleed strip touching the card's border rather than a block
    // that reads as one target (`SetupChecklist`'s own note).
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  // 32px, not the 40px of the phone's shopping-hub sheet rows: six of these
  // stack in a 300px rail beside the capture card, and at 40px the card alone
  // ran past 340px tall.
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
});
