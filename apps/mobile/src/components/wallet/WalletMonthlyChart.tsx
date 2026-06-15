import React, { useState, useCallback } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface MonthlyDeltaBar {
  /** Month key 'YYYY-MM' (for keys / tooltip secondary use) */
  month: string;
  /** Localized short x-axis label, e.g. 'Jun' */
  label: string;
  /** Signed value already converted to the display currency */
  value: number;
}

interface Props {
  data: MonthlyDeltaBar[];
  formatValue: (v: number) => string;
  height?: number;
}

export function WalletMonthlyChart({ data, formatValue, height = 150 }: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width: screenWidth } = useWindowDimensions();
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

  const barData = data.map((d, index) => ({
    value: d.value,
    label: d.label,
    frontColor: d.value < 0 ? theme.colors.danger : theme.colors.success,
    onPress: () => handlePress(index),
  }));

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hasNegative = data.some((d) => d.value < 0);
  const selected = selectedIndex !== null ? data[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {selected && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipLabel}>{selected.label}</Text>
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
        data={barData}
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
