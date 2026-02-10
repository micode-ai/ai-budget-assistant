import React from 'react';
import { View, Text } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { ChartRenderer } from '@/components/interactive-charts';
import type { ChartConfig } from '@budget/shared-types';

interface StoryChartProps {
  title?: string;
  chartConfig: ChartConfig;
}

export function StoryChart({ title, chartConfig }: StoryChartProps) {
  const styles = useStyles(createStyles);

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.chartWrapper}>
        <ChartRenderer config={chartConfig} />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  chartWrapper: {
    alignItems: 'center' as const,
  },
});
