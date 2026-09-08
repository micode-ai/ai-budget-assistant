import { View } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { SpendingTrendChart, DayOfWeekSection } from '@/components/analytics';
import type { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';
import type { TimeRange } from '@/features/analytics/useAnalytics';

export function TrendAndWeekdayRow({
  dailySpending,
  selectedRange,
  onBarPress,
  dayOfWeekSpending,
}: {
  dailySpending: ReturnType<typeof useAnalyticsScreenData>['dailySpending'];
  selectedRange: TimeRange;
  onBarPress: () => void;
  dayOfWeekSpending: ReturnType<typeof useAnalyticsScreenData>['dayOfWeekSpending'];
}) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.trendRow}>
      <View style={[styles.trendRowItem, { flex: 2, minWidth: 0 }]}>
        <SpendingTrendChart dailySpending={dailySpending} selectedRange={selectedRange} onBarPress={onBarPress} />
      </View>
      <View style={[styles.trendRowItem, { flex: 1, minWidth: 0 }]}>
        <DayOfWeekSection dayOfWeekSpending={dayOfWeekSpending} />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  trendRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  trendRowItem: {
    // width comes purely from the flex weight the caller passes inline
    // (flex: 2 / flex: 1) — nothing else to set here.
  },
});
