import { View, Text, StyleSheet } from 'react-native';

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
              const percentage = (item.value / total) * 100;
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
                      position: 'absolute',
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

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pieContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieRings: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    opacity: 0.8,
  },
  centerCircle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: {
    fontSize: 10,
    color: '#999',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  legend: {
    marginLeft: 16,
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendLabel: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  moreText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  horizontalBars: {
    marginTop: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  barLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100,
  },
  barDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  barLabel: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barPercentage: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    width: 35,
    textAlign: 'right',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginVertical: 20,
  },
});
