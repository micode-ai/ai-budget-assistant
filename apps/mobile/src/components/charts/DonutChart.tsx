import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme, useStyles, type Theme } from '@/theme';

interface DonutChartData {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartData[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function createArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function DonutChart({
  data,
  size = 150,
  strokeWidth = 24,
  centerLabel,
  centerValue,
  showLegend = true,
}: DonutChartProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;

  // Build arc segments
  const segments: { path: string; color: string }[] = [];
  let currentAngle = 0;

  sortedData.forEach((item) => {
    const sweepAngle = (item.value / total) * 360;
    if (sweepAngle < 0.5) return;

    // For nearly full circle, clamp to avoid rendering artifact
    const endAngle = currentAngle + Math.min(sweepAngle, 359.99);
    const path = createArcPath(cx, cy, radius, currentAngle, endAngle);
    segments.push({ path, color: item.color });
    currentAngle += sweepAngle;
  });

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        {/* SVG Donut */}
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size}>
            {/* Background track */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={theme.colors.progressTrack}
              strokeWidth={strokeWidth}
            />
            {/* Data segments */}
            {segments.map((seg, i) => (
              <Path
                key={i}
                d={seg.path}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            ))}
          </Svg>
          {/* Center label */}
          <View style={styles.centerCircle}>
            {centerLabel && <Text style={styles.centerLabel}>{centerLabel}</Text>}
            {centerValue && <Text style={styles.centerValue}>{centerValue}</Text>}
          </View>
        </View>

        {/* Legend */}
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

      {/* Horizontal bar breakdown */}
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
  centerCircle: {
    position: 'absolute' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  centerLabel: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
  centerValue: {
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
