import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useStyles, type Theme } from '@/theme';

/**
 * One tile. `onPress` present ⇒ clickable (Total Spent / Avg per day, both
 * open the drill-down) with a hover tint — the one mouse-only affordance
 * this screen adds (Interactions §Hover). `onPress` absent ⇒ a plain,
 * non-interactive tile (Top Category / Transactions carry no destination).
 */
export function SummaryTile({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);

  if (!onPress) {
    return (
      <View style={styles.summaryTile}>
        <Text style={styles.summaryLabel}>{label}</Text>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.summaryTile, hovered && styles.summaryTileHovered]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      {children}
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  summaryTile: {
    flexBasis: '23%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 200,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  summaryTileHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  summaryLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1.5],
  },
});
