import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useContentWidth } from '@/hooks/useContentWidth';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme, useStyles, type Theme } from '@/theme';

import type { MonthlyDeltaBar } from '@/features/wallet/monthlyBars';

export type { MonthlyDeltaBar };

interface Props {
  data: MonthlyDeltaBar[];
  formatValue: (v: number) => string;
  /** Label for the balance-correction segment (legend + tooltip). */
  adjustmentLabel: string;
  /** Label for the tracked (real income/spending) part in the tooltip. */
  trackedLabel: string;
  height?: number;
}

export function WalletMonthlyChart({ data, formatValue, adjustmentLabel, trackedLabel, height = 150 }: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const screenWidth = useContentWidth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handlePress = useCallback((index: number) => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }, []);

  // Layout mirrors InteractiveBarChart: container(32) + card(32) padding + y labels
  const yAxisLabelWidth = 48;
  const chartWidth = screenWidth - 64 - yAxisLabelWidth;
  const n = Math.max(data.length, 1);
  const spacing = Math.min(chartWidth / (3 * n + 1), 24);
  const barWidth = Math.min(36, (chartWidth - (n + 1) * spacing) / n);

  // Each month is a stack: the tracked part (green/red) and the correction (neutral).
  const adjustmentColor = theme.colors.textTertiary;
  const stackData = data.map((d, index) => {
    const tracked = d.value - d.adjustment;
    return {
      label: d.label,
      onPress: () => handlePress(index),
      stacks: [
        { value: tracked, color: tracked < 0 ? theme.colors.danger : theme.colors.success },
        { value: d.adjustment, color: adjustmentColor },
      ],
    };
  });
  const hasAdjustment = data.some((d) => d.adjustment !== 0);

  const extent = (d: MonthlyDeltaBar) => {
    const tracked = d.value - d.adjustment;
    return Math.max(Math.abs(tracked), Math.abs(d.adjustment), Math.abs(d.value));
  };
  const maxAbs = Math.max(...data.map(extent), 1);
  const hasNegative = data.some((d) => d.value < 0 || d.value - d.adjustment < 0 || d.adjustment < 0);
  const selected = selectedIndex !== null ? data[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {selected && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipLabel}>{selected.label}</Text>
          {selected.adjustment !== 0 && (
            <>
              <Text style={styles.tooltipLine}>
                {trackedLabel}: {formatValue(selected.value - selected.adjustment)}
              </Text>
              <Text style={styles.tooltipLine}>
                {adjustmentLabel}: {selected.adjustment >= 0 ? '+' : ''}
                {formatValue(selected.adjustment)}
              </Text>
            </>
          )}
          <Text
            style={[
              styles.tooltipValue,
              { color: selected.value < 0 ? theme.colors.danger : theme.colors.success },
            ]}
          >
            {selected.value >= 0 ? '+' : ''}
            {formatValue(selected.value)}
          </Text>
        </View>
      )}
      <BarChart
        stackData={stackData}
        width={chartWidth}
        height={height}
        barWidth={barWidth}
        spacing={spacing}
        isAnimated={false}
        maxValue={maxAbs * 1.15}
        mostNegativeValue={hasNegative ? -maxAbs * 1.15 : undefined}
        noOfSections={hasNegative ? 2 : 4}
        noOfSectionsBelowXAxis={hasNegative ? 2 : 0}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={theme.colors.border}
        yAxisTextStyle={styles.axisText}
        yAxisLabelWidth={yAxisLabelWidth}
        xAxisLabelTextStyle={styles.axisText}
        rulesColor={theme.colors.borderLight}
        rulesType="dashed"
        barBorderRadius={theme.borderRadius.sm}
        disablePress={false}
        disableScroll
      />
      {hasAdjustment && (
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: adjustmentColor }]} />
          <Text style={styles.legendText}>{adjustmentLabel}</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  tooltip: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tooltipLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  tooltipLine: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  legend: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  tooltipValue: {
    ...theme.textStyles.bodySmMedium,
    marginTop: theme.spacing[0.5],
  },
  axisText: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});
