import React, { useState, useCallback } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ChartDataPoint } from '@budget/shared-types';

interface InteractiveBarChartProps {
  data: ChartDataPoint[];
  height?: number;
  onBarPress?: (item: ChartDataPoint, index: number) => void;
  formatValue?: (value: number) => string;
  animate?: boolean;
  barColor?: string;
  showValues?: boolean;
}

export function InteractiveBarChart({
  data,
  height = 200,
  onBarPress,
  formatValue = (v) => v.toFixed(0),
  animate = true,
  barColor,
  showValues = false,
}: InteractiveBarChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width: screenWidth } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const defaultBarColor = barColor ?? theme.colors.primary;

  const handleBarPress = useCallback(
    (item: ChartDataPoint, index: number) => {
      setSelectedIndex(index);
      onBarPress?.(item, index);
    },
    [onBarPress],
  );

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>{t('drillDown.noDataAvailable')}</Text>
      </View>
    );
  }

  // Layout: container padding (2×16=32) + chartContainer padding (2×16=32) = 64px
  // gifted-charts renders: yAxisLabels (yAxisLabelWidth) + data area (width prop)
  const yAxisLabelWidth = 40;
  const chartWidth = screenWidth - 64 - yAxisLabelWidth;

  // gifted-charts uses spacing uniformly: (n+1) gaps + n bars = chartWidth
  // Target ratio: barWidth ≈ 2× spacing for balanced look
  // Solve: (n+1)*s + n*2s = chartWidth → s = chartWidth / (3n + 1)
  const n = data.length;
  const spacing = Math.min(chartWidth / (3 * n + 1), 20);
  const barWidth = Math.min(40, (chartWidth - (n + 1) * spacing) / n);

  // Show every Nth label to prevent overlap — each label needs ~20px
  const maxLabels = Math.floor(chartWidth / 20);
  const labelInterval = n > maxLabels ? Math.ceil(n / maxLabels) : 1;

  const barData = data.map((point, index) => ({
    value: point.value,
    label: index % labelInterval === 0 ? point.label : '',
    frontColor:
      selectedIndex === index
        ? theme.colors.primaryDark
        : point.color ?? defaultBarColor,
    onPress: () => handleBarPress(point, index),
    topLabelComponent: showValues
      ? () => (
          <Text style={styles.topLabel}>{formatValue(point.value)}</Text>
        )
      : undefined,
  }));

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      {selectedIndex !== null && data[selectedIndex] && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipLabel}>{data[selectedIndex].label}</Text>
          <Text style={styles.tooltipValue}>
            {formatValue(data[selectedIndex].value)}
          </Text>
        </View>
      )}
      <BarChart
        data={barData}
        width={chartWidth}
        height={height}
        barWidth={barWidth}
        spacing={spacing}
        isAnimated={animate}
        animationDuration={600}
        maxValue={maxValue * 1.1}
        noOfSections={4}
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
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginVertical: theme.spacing[5],
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
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[0.5],
  },
  topLabel: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  axisText: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});
