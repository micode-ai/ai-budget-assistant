import { View, Text } from 'react-native';
import { useStyles, type Theme } from '@/theme';

interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  size?: number;
  showLegend?: boolean;
}

export function PieChart({ data, size = 150, showLegend = true }: PieChartProps) {
  const styles = useStyles(createStyles);

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Create segments as a simplified visual representation
  // Using concentric rings to show proportions
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        {/* Simplified pie representation using stacked bars */}
        <View style={[styles.pieContainer, { width: size, height: size }]}>
          <View style={styles.pieRings}>
            {sortedData.map((item, index) => {
              const ringSize = size - index * 20;

              return (
                <View
                  key={index}
                  style={[
                    styles.ring,
                    {
                      width: ringSize,
                      height: ringSize,
                      borderRadius: ringSize / 2,
                      backgroundColor: item.color,
                      position: 'absolute' as const,
                    },
                  ]}
                />
              );
            })}
            <View style={styles.centerCircle}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{total.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {showLegend && (
          <View style={styles.legend}>
            {sortedData.slice(0, 5).map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <View style={styles.legendTextContainer}>
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.legendValue}>
                    {((item.value / total) * 100).toFixed(0)}%
                  </Text>
                </View>
              </View>
            ))}
            {sortedData.length > 5 && (
              <Text style={styles.moreText}>+{sortedData.length - 5} more</Text>
            )}
          </View>
        )}
      </View>

      {/* Horizontal bar representation for better visualization */}
      <View style={styles.horizontalBars}>
        {sortedData.slice(0, 5).map((item, index) => {
          const percentage = (item.value / total) * 100;
          return (
            <View key={index} style={styles.barRow}>
              <View style={styles.barLabelContainer}>
                <View style={[styles.barDot, { backgroundColor: item.color }]} />
                <Text style={styles.barLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${percentage}%`,
                      backgroundColor: item.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barPercentage}>{percentage.toFixed(0)}%</Text>
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
  chartRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  pieContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pieRings: {
    width: '100%' as const,
    height: '100%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ring: {
    opacity: 0.8,
  },
  centerCircle: {
    position: 'absolute' as const,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  totalLabel: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
  totalValue: {
    ...theme.textStyles.bodySm,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
  legend: {
    marginLeft: theme.spacing[4],
    flex: 1,
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
  legendTextContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  legendLabel: {
    ...theme.textStyles.caption,
    fontSize: 12,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  legendValue: {
    ...theme.textStyles.caption,
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing[2],
  },
  moreText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  horizontalBars: {
    marginTop: theme.spacing[2],
  },
  barRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  barLabelContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: 100,
  },
  barDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing[1.5],
  },
  barLabel: {
    ...theme.textStyles.caption,
    fontSize: 12,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    marginHorizontal: theme.spacing[2],
    overflow: 'hidden' as const,
  },
  barFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  barPercentage: {
    ...theme.textStyles.bodySmMedium,
    fontSize: 12,
    color: theme.colors.textPrimary,
    width: 35,
    textAlign: 'right' as const,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginVertical: theme.spacing[5],
  },
});
