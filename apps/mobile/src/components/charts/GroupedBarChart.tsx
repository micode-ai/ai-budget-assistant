import { View, Text } from 'react-native';
import { useStyles, type Theme } from '@/theme';

interface GroupedBarValue {
  value: number;
  color: string;
}

interface GroupedBarData {
  label: string;
  values: GroupedBarValue[];
}

interface LegendItem {
  label: string;
  color: string;
}

interface GroupedBarChartProps {
  data: GroupedBarData[];
  height?: number;
  showLabels?: boolean;
  showValues?: boolean;
  formatValue?: (value: number) => string;
  legendItems?: LegendItem[];
}

export function GroupedBarChart({
  data,
  height = 150,
  showLabels = true,
  showValues = false,
  formatValue = (v) => v.toFixed(0),
  legendItems,
}: GroupedBarChartProps) {
  const styles = useStyles(createStyles);

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const allValues = data.flatMap((d) => d.values.map((v) => v.value));
  const maxValue = Math.max(...allValues, 1);
  const barsPerGroup = data[0]?.values.length || 1;
  const barWidth = Math.max(
    4,
    Math.min(16, (300 - data.length * 8) / (data.length * barsPerGroup)),
  );

  return (
    <View style={styles.container}>
      {/* Legend */}
      {legendItems && legendItems.length > 0 && (
        <View style={styles.legendRow}>
          {legendItems.map((item, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Chart */}
      <View style={[styles.chartArea, { height }]}>
        {data.map((group, groupIndex) => (
          <View key={groupIndex} style={styles.groupContainer}>
            <View style={styles.barsRow}>
              {group.values.map((bar, barIndex) => {
                const barHeight = (bar.value / maxValue) * (height - 40);
                return (
                  <View key={barIndex} style={styles.barWrapper}>
                    {showValues && bar.value > 0 && (
                      <Text style={styles.valueLabel}>{formatValue(bar.value)}</Text>
                    )}
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(2, barHeight),
                          width: barWidth,
                          backgroundColor: bar.color,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
            {showLabels && (
              <Text style={styles.label} numberOfLines={1}>
                {group.label}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
  },
  legendRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  legendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    ...theme.textStyles.caption,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  chartArea: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-around' as const,
    paddingHorizontal: theme.spacing[1],
  },
  groupContainer: {
    alignItems: 'center' as const,
    flex: 1,
  },
  barsRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
    gap: 2,
    flex: 1,
  },
  barWrapper: {
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    flex: 1,
  },
  bar: {
    borderRadius: theme.borderRadius.sm,
    minHeight: 2,
  },
  label: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    textAlign: 'center' as const,
  },
  valueLabel: {
    fontSize: 8,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[0.5],
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[5],
  },
});
