import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { DrillDownLevel } from '@budget/shared-types';

interface BreadcrumbItem {
  level: DrillDownLevel;
  label: string;
  id?: string;
}

interface DrillDownBreadcrumbProps {
  breadcrumb: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export type { BreadcrumbItem };

export function DrillDownBreadcrumb({
  breadcrumb,
  onNavigate,
}: DrillDownBreadcrumbProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (breadcrumb.length === 0) {
    return null;
  }

  const lastIndex = breadcrumb.length - 1;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
    >
      {breadcrumb.map((item, index) => {
        const isLast = index === lastIndex;

        return (
          <View key={`${item.level}-${index}`} style={styles.itemRow}>
            {isLast ? (
              <View style={styles.activeItem}>
                <Text style={styles.activeLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.tappableItem}
                onPress={() => onNavigate(index)}
                activeOpacity={0.6}
              >
                <Text style={styles.tappableLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
            {!isLast && (
              <Ionicons
                name="chevron-forward"
                size={14}
                color={theme.colors.textTertiary}
                style={styles.chevron}
              />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    maxHeight: 40,
  },
  scrollContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[2],
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  tappableItem: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
  },
  tappableLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textLink,
  },
  activeItem: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primaryLight,
  },
  activeLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  chevron: {
    marginHorizontal: theme.spacing[0.5],
  },
});
