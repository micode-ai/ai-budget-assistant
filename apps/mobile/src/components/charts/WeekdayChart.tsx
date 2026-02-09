import { View, Text } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface WeekdayData {
  label: string;
  value: number;
  count: number;
}

interface WeekdayChartProps {
  data: WeekdayData[];
  baseColor?: string;
  formatValue?: (value: number) => string;
}

export function WeekdayChart({
  data,
  baseColor,
  formatValue = (v) => v.toFixed(0),
}: WeekdayChartProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const resolvedColor = baseColor || theme.colors.primary;

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const peakIndex = data.reduce((maxIdx, d, idx, arr) => (d.value > arr[maxIdx].value ? idx : maxIdx), 0);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {data.map((day, index) => {
          const opacity = day.value > 0 ? 0.15 + (day.value / maxValue) * 0.85 : 0.05;
          const isPeak = index === peakIndex && day.value > 0;

          return (
            <View key={index} style={styles.cell}>
              <View
                style={[
                  styles.cellBox,
                  {
                    backgroundColor: resolvedColor,
                    opacity,
                  },
                  isPeak && {
                    borderWidth: 2,
                    borderColor: resolvedColor,
                    opacity: 1,
                  },
                ]}
              >
                {isPeak && (
                  <View
                    style={[
                      styles.cellBoxInner,
                      {
                        backgroundColor: resolvedColor,
                        opacity: 0.15 + (day.value / maxValue) * 0.85,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={[styles.dayLabel, isPeak && styles.dayLabelPeak]}>
                {day.label}
              </Text>
              <Text style={[styles.dayValue, isPeak && styles.dayValuePeak]}>
                {formatValue(day.value)}
              </Text>
              {day.count > 0 && (
                <Text style={styles.dayCount}>{day.count}x</Text>
              )}
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
  grid: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  cell: {
    flex: 1,
    alignItems: 'center' as const,
    paddingHorizontal: 2,
  },
  cellBox: {
    width: '100%' as const,
    aspectRatio: 1,
    borderRadius: theme.borderRadius.md,
    maxWidth: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  cellBoxInner: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dayLabel: {
    ...theme.textStyles.caption,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1.5],
  },
  dayLabelPeak: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  dayValue: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  dayValuePeak: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  dayCount: {
    ...theme.textStyles.caption,
    fontSize: 9,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginVertical: theme.spacing[5],
  },
});
