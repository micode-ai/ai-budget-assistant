import React, { useState, useCallback } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
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

const screenWidth = Dimensions.get('window').width;

export function InteractiveBarChart({
  data,
  height = 200,
  onBarPress,
  formatValue = (v) => v.toFixed(0),
  animate = true,
  barColor,
  showValues = false,
}: InteractiveBarChartProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
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
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const chartWidth = screenWidth - 64;
  const barWidth = Math.max(16, Math.min(40, (chartWidth - data.length * 8) / data.length));

  const barData = data.map((point, index) => ({
    value: point.value,
    label: point.label,
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
        spacing={Math.max(8, (chartWidth - barData.length * barWidth) / (barData.length + 1))}
        isAnimated={animate}
        animationDuration={600}
        maxValue={maxValue * 1.1}
        noOfSections={4}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={theme.colors.border}
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        rulesColor={theme.colors.borderLight}
        rulesType="dashed"
        barBorderRadius={theme.borderRadius.sm}
        disablePress={false}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    alignItems: 'center' as const,
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
