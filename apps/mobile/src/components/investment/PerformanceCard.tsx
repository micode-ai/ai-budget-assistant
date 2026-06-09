import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { PerformancePoint } from '@/hooks/usePortfolioAnalytics';

interface Props {
  performanceHistory: PerformancePoint[];
  latestValue: number;
  periodReturn: number;
  isPeriodPositive: boolean;
  onInfoPress: () => void;
}

export function PerformanceCard({ performanceHistory, latestValue, periodReturn, isPeriodPositive, onInfoPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onInfoPress}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>{t('investments.performance')}</Text>
        <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.performanceHeader}>
        <Text style={styles.performanceValue}>{latestValue.toFixed(2)}</Text>
        <View style={[styles.returnBadge, { backgroundColor: isPeriodPositive ? theme.colors.success + '20' : theme.colors.danger + '20' }]}>
          <Ionicons
            name={isPeriodPositive ? 'arrow-up' : 'arrow-down'}
            size={14}
            color={isPeriodPositive ? theme.colors.success : theme.colors.danger}
          />
          <Text style={[styles.returnText, { color: isPeriodPositive ? theme.colors.success : theme.colors.danger }]}>
            {isPeriodPositive ? '+' : ''}{periodReturn.toFixed(2)}%
          </Text>
        </View>
      </View>

      {performanceHistory.length > 0 ? (
        <View style={styles.timeline}>
          {performanceHistory
            .filter((_, i) => i % Math.max(1, Math.floor(performanceHistory.length / 5)) === 0)
            .map((entry) => (
              <View key={entry.date} style={styles.timelineEntry}>
                <Text style={styles.timelineDate}>
                  {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={styles.timelineValue}>{entry.value.toFixed(0)}</Text>
              </View>
            ))}
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="analytics-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.placeholderText}>{t('investments.noPerformanceData')}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  performanceHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  performanceValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  returnBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[1],
  },
  returnText: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
  },
  timeline: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[3],
  },
  timelineEntry: {
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  timelineDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  timelineValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  placeholder: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[2],
  },
  placeholderText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
