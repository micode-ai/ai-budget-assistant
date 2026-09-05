import React, { useState, useCallback } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';
import { useContentWidth } from '@/hooks/useContentWidth';
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
  // Window-derived width, used only as a same-frame fallback (see measuredWidth below) —
  // it does not know about this chart's own ancestor paddings, let alone a grid track it
  // may sit in on desktop, so it is deliberately never the value used once we've measured.
  const contentWidth = useContentWidth();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const defaultBarColor = barColor ?? theme.colors.primary;

  // Same pattern as InteractiveLineChart: measure this component's own wrapper instead of
  // deriving from the window. A measured layout only arrives after the first render, so
  // `measuredWidth` starts null and the legacy window-derived estimate below covers that
  // one frame — it must never render at width 0.
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0) setMeasuredWidth(width);
  }, []);

  const handleBarPress = useCallback(
    (item: ChartDataPoint, index: number) => {
      setSelectedIndex(index);
      onBarPress?.(item, index);
    },
    [onBarPress],
  );

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]} onLayout={handleLayout}>
        <Text style={styles.emptyText}>{t('drillDown.noDataAvailable')}</Text>
      </View>
    );
  }

  const yAxisLabelWidth = 40;
  // Pre-measurement fallback ONLY: approximates this wrapper's width by subtracting the
  // 64px of ancestor padding (screen content padding + SpendingTrendChart's card padding,
  // 2×16 each) that used to be hardcoded here. `onLayout` fires shortly after the first
  // paint, triggering a re-render with the real `measuredWidth` — from then on it fully
  // replaces this estimate, since it already reflects whatever paddings or grid track
  // actually surround us (a fixed 64px guess would be wrong inside a desktop grid track).
  const containerWidth = measuredWidth ?? contentWidth - 64;
  const chartWidth = containerWidth - yAxisLabelWidth;

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
    <View style={styles.container} onLayout={handleLayout}>
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
