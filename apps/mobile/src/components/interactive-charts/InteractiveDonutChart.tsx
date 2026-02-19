import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ChartDataPoint } from '@budget/shared-types';

interface InteractiveDonutChartProps {
  data: ChartDataPoint[];
  size?: number;
  onSectionPress?: (item: ChartDataPoint, index: number) => void;
  formatValue?: (value: number) => string;
  showLegend?: boolean;
  innerRadius?: number;
}

const DEFAULT_COLORS = [
  '#4ECDC4',
  '#FF6B6B',
  '#45B7D1',
  '#96CEB4',
  '#F5A623',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
];

export function InteractiveDonutChart({
  data,
  size = 180,
  onSectionPress,
  formatValue = (v) => v.toFixed(0),
  showLegend = true,
  innerRadius,
}: InteractiveDonutChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const resolvedInnerRadius = innerRadius ?? size * 0.35;

  const handleSectionPress = useCallback(
    (item: ChartDataPoint, index: number) => {
      setFocusedIndex((prev) => (prev === index ? null : index));
      onSectionPress?.(item, index);
    },
    [onSectionPress],
  );

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>{t('drillDown.noDataAvailable')}</Text>
      </View>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  const pieData = data.map((point, index) => ({
    value: point.value,
    color: point.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    text: formatValue(point.value),
    onPress: () => handleSectionPress(point, index),
    focused: focusedIndex === index,
    shiftX: focusedIndex === index ? 4 : 0,
    shiftY: focusedIndex === index ? -4 : 0,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <PieChart
          data={pieData}
          donut
          radius={size / 2}
          innerRadius={resolvedInnerRadius}
          innerCircleColor={theme.colors.surface}
          focusOnPress
          centerLabelComponent={() => (
            <View style={styles.centerContent}>
              <Text style={styles.centerLabel}>{t('drillDown.total')}</Text>
              <Text style={styles.centerValue}>{formatValue(total)}</Text>
            </View>
          )}
        />
      </View>

      {focusedIndex !== null && data[focusedIndex] && (
        <View style={styles.selectedInfo}>
          <View
            style={[
              styles.selectedDot,
              {
                backgroundColor:
                  data[focusedIndex].color ??
                  DEFAULT_COLORS[focusedIndex % DEFAULT_COLORS.length],
              },
            ]}
          />
          <Text style={styles.selectedLabel}>{data[focusedIndex].label}</Text>
          <Text style={styles.selectedValue}>
            {formatValue(data[focusedIndex].value)} (
            {((data[focusedIndex].value / total) * 100).toFixed(1)}%)
          </Text>
        </View>
      )}

      {showLegend && (
        <View style={styles.legend}>
          {data.map((point, index) => {
            const color =
              point.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
            const percentage = ((point.value / total) * 100).toFixed(1);

            return (
              <View key={point.id ?? index} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {point.label}
                </Text>
                <Text style={styles.legendPercentage}>{percentage}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    alignItems: 'center' as const,
  },
  chartWrapper: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginVertical: theme.spacing[5],
  },
  centerContent: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  centerLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  centerValue: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[0.5],
  },
  selectedInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginTop: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing[2],
  },
  selectedLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  selectedValue: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  legend: {
    width: '100%' as const,
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[2],
  },
  legendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing[2],
  },
  legendLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  legendPercentage: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing[2],
  },
});
