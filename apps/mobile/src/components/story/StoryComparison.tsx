import React from 'react';
import { View, Text } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface StoryComparisonProps {
  title?: string;
  metrics: Array<{ label: string; value: string; change?: number }>;
}

export function StoryComparison({ title, metrics }: StoryComparisonProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const renderChangeIndicator = (change?: number) => {
    if (change === undefined || change === 0 || isNaN(change)) return null;

    const isPositive = change > 0;
    const arrow = isPositive ? '\u2191' : '\u2193';
    const color = isPositive ? theme.colors.success : theme.colors.danger;
    const backgroundColor = isPositive
      ? theme.colors.primaryLight
      : theme.colors.dangerLight;

    return (
      <View style={[styles.changeBadge, { backgroundColor }]}>
        <Text style={[styles.changeText, { color }]}>
          {arrow} {Math.abs(change).toFixed(1)}%
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.metricsRow}>
        {metrics.map((metric, index) => (
          <View key={`comparison-${index}`} style={styles.metricCard}>
            <Text style={styles.metricValue}>{metric.value}</Text>
            {renderChangeIndicator(metric.change)}
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  metricsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  metricCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  metricValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  metricLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    textAlign: 'center' as const,
  },
  changeBadge: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    marginTop: theme.spacing[1],
  },
  changeText: {
    ...theme.textStyles.bodySmMedium,
  },
});
