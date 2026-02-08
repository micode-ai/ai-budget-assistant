import { View, Text } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface BarChartData {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartData[];
  height?: number;
  barColor?: string;
  showLabels?: boolean;
  showValues?: boolean;
  formatValue?: (value: number) => string;
}

export function BarChart({
  data,
  height = 150,
  barColor,
  showLabels = true,
  showValues = false,
  formatValue = (v) => v.toFixed(0),
}: BarChartProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const resolvedBarColor = barColor || theme.colors.primary;

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(4, Math.min(20, (300 - data.length * 2) / data.length));

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.chartArea}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 40);

          return (
            <View key={index} style={styles.barContainer}>
              <View style={styles.barWrapper}>
                {showValues && item.value > 0 && (
                  <Text style={styles.valueLabel}>{formatValue(item.value)}</Text>
                )}
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(2, barHeight),
                      width: barWidth,
                      backgroundColor: resolvedBarColor,
                    },
                  ]}
                />
              </View>
              {showLabels && <Text style={styles.label}>{item.label}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-around' as const,
    paddingHorizontal: theme.spacing[1],
  },
  barContainer: {
    alignItems: 'center' as const,
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
