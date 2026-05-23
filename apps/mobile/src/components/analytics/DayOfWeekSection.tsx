import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WeekdayChart } from '@/components/charts';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { DayOfWeekSpending } from '@/features/analytics/useAnalytics';

interface Props {
  dayOfWeekSpending: DayOfWeekSpending[];
}

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

export function DayOfWeekSection({ dayOfWeekSpending }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const peak = dayOfWeekSpending.reduce(
    (max, d) => (d.totalAmount > max.totalAmount ? d : max),
    dayOfWeekSpending[0],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.dayOfWeekTitle')}</Text>
      <View style={styles.chartContainer}>
        <WeekdayChart
          data={dayOfWeekSpending.map((d) => ({
            label: d.dayLabel,
            value: d.totalAmount,
            count: d.transactionCount,
          }))}
          formatValue={formatChartValue}
        />
        {peak && peak.totalAmount > 0 && (
          <View style={styles.weekdayInsight}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.info} />
            <Text style={styles.weekdayInsightText}>
              {t('analytics.peakDayInsight', { day: peak.dayLabel })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    ...theme.shadows.sm,
  },
  weekdayInsight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  weekdayInsightText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
