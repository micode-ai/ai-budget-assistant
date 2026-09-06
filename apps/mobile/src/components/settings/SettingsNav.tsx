import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SETTINGS_NAV_WIDTH } from '@/components/webLayout.constants';
import {
  isLinkEntry,
  isPaneEntry,
  visibleSettingsEntries,
  type SettingsEntry,
  type SettingsEntryKey,
} from '@/features/settings/settingsRegistry';

interface Props {
  /** The pane currently open, if any. A link key is never passed here. */
  selectedKey?: SettingsEntryKey;
  isAdmin: boolean;
  /** Live count for the one row that carries one on the hub today. */
  pendingPurchaseRequests: number;
}

/**
 * The shell's left pane: every settings destination, in one flat list.
 *
 * **Two blocks, one divider.** Panes above, links below, links carrying an
 * outbound arrow — that divider and that arrow are the entire mechanism that
 * keeps "opens here" and "leaves settings" from being confused, which is why
 * there are no group headers: grouping would need new i18n keys, and this body
 * of work has shipped without one.
 *
 * **No scroller of its own.** It lives inside the shell's single page scroll,
 * as the dashboard's rail does.
 *
 * The divider renders only when both blocks have rows. Until the first screen
 * is extracted every entry is a link, and a divider with nothing above it
 * would draw a boundary that means nothing.
 */
export function SettingsNav({ selectedKey, isAdmin, pendingPurchaseRequests }: Props) {
  const styles = useStyles(createStyles);
  const entries = visibleSettingsEntries(isAdmin);
  const panes = entries.filter(isPaneEntry);
  const links = entries.filter(isLinkEntry);

  const renderRow = (entry: SettingsEntry) => (
    <SettingsNavRow
      key={entry.key}
      entry={entry}
      selected={entry.key === selectedKey && isPaneEntry(entry)}
      badge={entry.key === 'purchaseRequests' ? pendingPurchaseRequests : 0}
    />
  );

  return (
    <View style={styles.nav}>
      {panes.map(renderRow)}
      {panes.length > 0 && links.length > 0 && <View style={styles.divider} />}
      {links.map(renderRow)}
    </View>
  );
}

function SettingsNavRow({
  entry,
  selected,
  badge,
}: {
  entry: SettingsEntry;
  selected: boolean;
  badge: number;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={() => router.push(entry.route as never)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.row, hovered && styles.rowHovered, selected && styles.rowSelected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {t(entry.labelKey)}
      </Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      {isLinkEntry(entry) && (
        // The outbound arrow is half the pane/link mechanism — it is what says
        // this row leaves settings rather than opening beside the list.
        <Ionicons name="open-outline" size={14} color={theme.colors.textTertiary} />
      )}
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  nav: {
    width: SETTINGS_NAV_WIDTH,
    flexShrink: 0,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRightWidth: 1,
    borderRightColor: theme.colors.borderLight,
    // Paints its own ground: a transparent tree shows React Navigation's
    // rgb(242,242,242) default through it, which is light grey under
    // dark-theme text.
    backgroundColor: theme.colors.surface,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
    marginHorizontal: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowSelected: {
    backgroundColor: theme.colors.primary + '15',
  },
  label: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  labelSelected: {
    color: theme.colors.primary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[1],
  },
  badgeText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
  },
});
