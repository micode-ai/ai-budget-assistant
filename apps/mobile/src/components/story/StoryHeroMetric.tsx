import React from 'react';
import { View, Text } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface StoryHeroMetricProps {
  title?: string;
  metrics: Array<{ label: string; value: string; change?: number }>;
  tone?: 'positive' | 'neutral' | 'warning' | 'celebration';
}

const TONE_BACKGROUNDS: Record<string, (theme: Theme) => string> = {
  positive: (theme) => theme.colors.primaryLight,
  neutral: (theme) => theme.colors.surfaceSecondary,
  warning: (theme) => theme.colors.warningLight,
  celebration: (theme) => theme.colors.primaryLight,
};

export function StoryHeroMetric({
  title,
  metrics,
  tone = 'neutral',
}: StoryHeroMetricProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const primaryMetric = metrics[0];
  const secondaryMetrics = metrics.slice(1);
  const backgroundColor =
    TONE_BACKGROUNDS[tone]?.(theme) ?? theme.colors.surfaceSecondary;

  const renderChangeIndicator = (change?: number) => {
    if (change === undefined || change === 0 || isNaN(change)) return null;

    const isPositive = change > 0;
    const arrow = isPositive ? '\u2191' : '\u2193';
    const color = isPositive ? theme.colors.success : theme.colors.danger;

    return (
      <Text style={[styles.changeText, { color }]}>
        {arrow} {Math.abs(change).toFixed(1)}%
      </Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      {primaryMetric && (
        <View style={styles.primaryMetricContainer}>
          <Text style={styles.primaryValue}>{primaryMetric.value}</Text>
          {renderChangeIndicator(primaryMetric.change)}
          <Text style={styles.primaryLabel}>{primaryMetric.label}</Text>
        </View>
      )}

      {secondaryMetrics.length > 0 && (
        <View style={styles.secondaryRow}>
          {secondaryMetrics.map((metric, index) => (
            <View key={`metric-${index}`} style={styles.secondaryMetric}>
              <Text style={styles.secondaryValue}>{metric.value}</Text>
              {renderChangeIndicator(metric.change)}
              <Text style={styles.secondaryLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    alignItems: 'center' as const,
  },
  title: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: theme.spacing[3],
  },
  primaryMetricContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  primaryValue: {
    ...theme.textStyles.display,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  primaryLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
    textAlign: 'center' as const,
  },
  changeText: {
    ...theme.textStyles.bodySmMedium,
    marginTop: theme.spacing[1],
  },
  secondaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[6],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    width: '100%' as const,
  },
  secondaryMetric: {
    alignItems: 'center' as const,
    flex: 1,
  },
  secondaryValue: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  secondaryLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
    textAlign: 'center' as const,
  },
});
