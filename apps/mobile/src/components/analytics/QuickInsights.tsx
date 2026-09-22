import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { SavingsKind } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { AnalyticsSummary, SpendingAnomalyItem, BudgetPredictionItem, TimeRange } from '@/features/analytics/useAnalytics';

interface Props {
  summary: AnalyticsSummary;
  anomalies: SpendingAnomalyItem[];
  predictions: BudgetPredictionItem[];
  selectedRange: TimeRange;
  currency: string;
  /**
   * Additive, default `undefined`. When passed, the "Discount savings"/
   * "Deposits paid" rows become tappable and open `SavingsDetailSheet` for
   * the given kind. When absent, both rows render exactly as before — a
   * plain, non-interactive card (no other consumer of this component passes
   * it today; the desktop analytics screen builds its own independent tile
   * markup in `InsightsCluster.tsx` rather than reusing this component for
   * these two rows).
   */
  onOpenSavings?: (kind: SavingsKind) => void;
}

export function QuickInsights({ summary, anomalies, predictions, selectedRange, currency, onOpenSavings }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      {/* Quick Insights */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('analytics.quickInsights')}</Text>

        {summary.mostExpensiveCategory && (
          <View style={styles.insightCard}>
            <Ionicons name="trending-up-outline" size={24} color={theme.colors.danger} />
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>{t('analytics.topCategory')}</Text>
              <Text style={styles.insightText}>
                {t('analytics.topCategoryText', { category: summary.mostExpensiveCategory, range: t(`analytics.${selectedRange}`) })}
              </Text>
            </View>
          </View>
        )}

        {summary.highestSpendingDay && (
          <View style={styles.insightCard}>
            <Ionicons name="calendar-outline" size={24} color={theme.colors.info} />
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>{t('analytics.peakSpendingDay')}</Text>
              <Text style={styles.insightText}>
                {t('analytics.peakSpendingText', {
                  date: new Date(summary.highestSpendingDay).toLocaleDateString(getIntlLocale(), {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  }),
                })}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.insightCard}>
          <Ionicons name="bulb-outline" size={24} color={theme.colors.warning} />
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>{t('analytics.dailyBudgetTip')}</Text>
            <Text style={styles.insightText}>
              {t('analytics.dailyBudgetText', { amount: formatCurrency(summary.averagePerDay * 0.9, currency) })}
            </Text>
          </View>
        </View>

        {summary.totalDiscountSavings > 0 && (
          <SavingsCard
            onPress={onOpenSavings ? () => onOpenSavings('discount') : undefined}
            icon="pricetag-outline"
            iconColor={theme.colors.success}
            title={t('analytics.totalSavings')}
            text={t('analytics.totalSavingsText', {
              amount: formatCurrency(summary.totalDiscountSavings, currency),
              range: t(`analytics.${selectedRange}`),
            })}
          />
        )}

        {summary.totalDepositsPaid > 0 && (
          <SavingsCard
            onPress={onOpenSavings ? () => onOpenSavings('deposit') : undefined}
            icon="wine-outline"
            iconColor={theme.colors.info}
            title={t('analytics.totalDepositsPaid')}
            text={t('analytics.totalDepositsPaidText', {
              amount: formatCurrency(summary.totalDepositsPaid, currency),
              range: t(`analytics.${selectedRange}`),
            })}
          />
        )}
      </View>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('insights.anomalies')}</Text>
          {anomalies.map((anomaly) => (
            <View key={anomaly.categoryId} style={styles.insightCard}>
              <Ionicons name="warning-outline" size={24} color={theme.colors.warning} />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{anomaly.categoryName}</Text>
                <Text style={styles.insightText}>
                  {t('insights.anomalyText', {
                    percent: anomaly.percentageChange,
                    category: anomaly.categoryName,
                  })}
                </Text>
                <Text style={[styles.insightText, { marginTop: 4 }]}>
                  {formatCurrency(anomaly.currentAmount, currency)} vs {formatCurrency(anomaly.averageAmount, currency)} {t('insights.avgLabel')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Budget Predictions */}
      {predictions.filter((p) => p.estimatedExhaustionDate).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('insights.predictions')}</Text>
          {predictions
            .filter((p) => p.estimatedExhaustionDate)
            .map((prediction) => (
              <View key={prediction.budgetId} style={styles.insightCard}>
                <Ionicons name="time-outline" size={24} color={theme.colors.danger} />
                <View style={styles.insightContent}>
                  <Text style={styles.insightTitle}>{prediction.budgetName}</Text>
                  <Text style={styles.insightText}>
                    {t('insights.exhaustionText', {
                      date: new Date(prediction.estimatedExhaustionDate!).toLocaleDateString(getIntlLocale(), {
                        month: 'short',
                        day: 'numeric',
                      }),
                    })}
                  </Text>
                  <Text style={[styles.insightText, { marginTop: 4 }]}>
                    {t('insights.projectedTotal', {
                      amount: formatCurrency(prediction.projectedTotal, prediction.currencyCode as any),
                    })}
                  </Text>
                </View>
              </View>
            ))}
        </View>
      )}
    </>
  );
}

interface SavingsCardProps {
  onPress?: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  text: string;
}

/**
 * The discount/deposit insight rows, factored out because they're the only
 * two rows in this file that can become tappable — every other tile here
 * (top category, peak day, predictions, anomalies) has no drill-down. Renders
 * a plain `View` (today's behavior, byte-for-byte) when `onPress` is absent,
 * or a `TouchableOpacity` with a trailing chevron when a caller wants a
 * drill-down (see `onOpenSavings` on this component's own props).
 */
function SavingsCard({ onPress, icon, iconColor, title, text }: SavingsCardProps) {
  const styles = useStyles(createStyles);
  const theme = useTheme();

  const inner = (
    <>
      <Ionicons name={icon} size={24} color={iconColor} />
      <View style={styles.insightContent}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightText}>{text}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />}
    </>
  );

  if (!onPress) {
    return <View style={styles.insightCard}>{inner}</View>;
  }

  return (
    <TouchableOpacity style={styles.insightCard} onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
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
  insightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    ...theme.shadows.sm,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  insightText: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});
