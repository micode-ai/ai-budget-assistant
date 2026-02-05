import { View, Text, StyleSheet } from 'react-native';

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
  barColor = '#4ECDC4',
  showLabels = true,
  showValues = false,
  formatValue = (v) => v.toFixed(0),
}: BarChartProps) {
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
                      backgroundColor: barColor,
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

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  bar: {
    borderRadius: 4,
    minHeight: 2,
  },
  label: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  valueLabel: {
    fontSize: 8,
    color: '#666',
    marginBottom: 2,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
  },
});
