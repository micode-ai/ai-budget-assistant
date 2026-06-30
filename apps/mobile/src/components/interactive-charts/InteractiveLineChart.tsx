import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useContentWidth } from '@/hooks/useContentWidth';
import { LineChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ChartDataPoint } from '@budget/shared-types';

interface InteractiveLineChartProps {
  data: ChartDataPoint[];
  height?: number;
  onPointPress?: (item: ChartDataPoint, index: number) => void;
  formatValue?: (value: number) => string;
  animate?: boolean;
  lineColor?: string;
  areaChart?: boolean;
}

export function InteractiveLineChart({
  data,
  height = 200,
  onPointPress,
  formatValue = (v) => v.toFixed(0),
  animate = true,
  lineColor,
  areaChart = true,
}: InteractiveLineChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const screenWidth = useContentWidth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const resolvedLineColor = lineColor ?? theme.colors.primary;

  const handlePointPress = useCallback(
    (item: ChartDataPoint, index: number) => {
      setSelectedIndex(index);
      onPointPress?.(item, index);
    },
    [onPointPress],
  );

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>{t('drillDown.noDataAvailable')}</Text>
      </View>
    );
  }

  // Account for card padding (16*2=32) + y-axis labels (~50px) + right padding for last label (~30px)
  const chartWidth = screenWidth - 120;

  const lineData = data.map((point, index) => ({
    value: point.value,
    label: point.label,
    dataPointText: formatValue(point.value),
    onPress: () => handlePointPress(point, index),
    customDataPoint: () => (
      <View
        style={[
          styles.dataPoint,
          {
            backgroundColor:
              selectedIndex === index
                ? theme.colors.primaryDark
                : resolvedLineColor,
          },
        ]}
      />
    ),
  }));

  // When the data contains negative values, gifted-charts allocates extra space below
  // the x-axis beyond `height`. We must explicitly set mostNegativeValue +
  // noOfSectionsBelowXAxis so the chart distributes sections within the given height.
  const hasNegative = data.some((d) => d.value < 0);
  const maxDataAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const minDataValue = hasNegative ? Math.min(...data.map((d) => d.value)) : 0;
  const maxValue = maxDataAbs * 1.15;
  const mostNegativeValue = hasNegative ? minDataValue * 1.15 : undefined;
  const noOfSectionsBelowXAxis = hasNegative ? 4 : undefined;

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
      <LineChart
        data={lineData}
        width={chartWidth}
        height={height}
        isAnimated={animate}
        animationDuration={600}
        curved
        maxValue={maxValue}
        noOfSections={4}
        mostNegativeValue={mostNegativeValue}
        noOfSectionsBelowXAxis={noOfSectionsBelowXAxis}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={theme.colors.border}
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        rulesColor={theme.colors.borderLight}
        rulesType="dashed"
        color={resolvedLineColor}
        thickness={2}
        dataPointsColor={resolvedLineColor}
        dataPointsRadius={4}
        areaChart={areaChart}
        startFillColor={resolvedLineColor}
        startOpacity={0.2}
        endFillColor={resolvedLineColor}
        endOpacity={0.02}
        textShiftY={-8}
        textShiftX={-4}
        textFontSize={10}
        textColor={theme.colors.textSecondary}
        hideDataPoints={false}
        initialSpacing={8}
        endSpacing={30}
        spacing={
          data.length > 1
            ? Math.max(30, (chartWidth - 38) / (data.length - 1))
            : chartWidth
        }
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
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
  dataPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  axisText: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});
