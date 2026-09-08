import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AIInsightChart } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import type { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';
import type { TimeRange, BudgetPredictionItem } from '@/features/analytics/useAnalytics';

export interface InsightsClusterProps {
  summary: ReturnType<typeof useAnalyticsScreenData>['summary'];
  predictions: BudgetPredictionItem[];
  selectedRange: TimeRange;
  currency: string;
  aiInsights: AIInsightChart[];
  aiInsightsProGated: boolean;
  /** True when the selected period is genuinely empty (Empty state) — the
   *  deterministic tiles (daily budget tip, discount savings, predictions)
   *  are meaningless at zero data and are dropped; the AI tiles are NOT
   *  period-scoped (`useAnalyticsScreenData` loads them once on mount/
   *  language change, never on period change) so they stay regardless,
   *  matching the design's explicit carve-out for the gated upsell tile. */
  suppressDeterministicTiles: boolean;
}

/**
 * Merges `AiInsightsSection` and `QuickInsights` into ONE 2-up cluster
 * (design's "Where two blocks answer the same question" + "What each mobile
 * affordance becomes"). Built fresh rather than nesting the two mobile
 * components, because merging them means hoisting `AiUsageBadge` out to the
 * CLUSTER's own header and making every tile (AI or deterministic) the same
 * shape — something wrapping the two mobile section components as opaque
 * blocks cannot produce; both mobile components are left untouched. The
 * "topCategory"/"highestSpendingDay" sentence cards and the Anomalies list
 * are dropped per decision 1/2/3 in the design and are not reproduced here
 * in any form — their computations still run in `useAnalyticsScreenData`,
 * unread by this component.
 */
export function InsightsCluster({
  summary,
  predictions,
  selectedRange,
  currency,
  aiInsights,
  aiInsightsProGated,
  suppressDeterministicTiles,
}: InsightsClusterProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const showUpgrade = useUpgradeStore((s) => s.show);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const exhaustingPredictions = predictions.filter((p) => p.estimatedExhaustionDate);

  const showAiUsageBadge = !aiInsightsProGated && aiInsights.length > 0;
  // The daily-budget-tip tile is unconditional whenever deterministic tiles
  // aren't suppressed (mirrors `QuickInsights`, which renders it with no
  // `if` guard at all) — so `!suppressDeterministicTiles` alone already
  // guarantees at least one deterministic tile exists.
  const hasAnyTile = aiInsightsProGated || aiInsights.length > 0 || !suppressDeterministicTiles;

  if (!hasAnyTile) return null;

  return (
    <View style={styles.section}>
      <View style={styles.clusterHeader}>
        <Text style={styles.sectionTitle}>{t('analytics.quickInsights')}</Text>
        {showAiUsageBadge && <AiUsageBadge />}
      </View>

      <View style={styles.insightsCluster}>
        {aiInsightsProGated && (
          <View style={[styles.insightTileWrap]}>
            <TouchableOpacity
              style={styles.gatedTile}
              activeOpacity={0.8}
              onPress={() => showUpgrade(t('insights.proRequired'), 'pro')}
            >
              <Ionicons name="lock-closed" size={18} color={theme.colors.warning} />
              <View style={styles.insightTileContent}>
                <Text style={styles.insightTileTitle} numberOfLines={1}>
                  {t('insights.aiSuggested')}
                </Text>
                <Text style={styles.insightTileSubtitle} numberOfLines={1}>
                  {t('insights.proRequired')}
                </Text>
              </View>
              <View style={styles.gatedChip}>
                <Text style={styles.gatedChipText}>{t('subscription.upgrade')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {!aiInsightsProGated &&
          aiInsights.slice(0, 5).map((insight) => {
            const isExpanded = expandedId === insight.id;
            const severityColor =
              insight.severity === 'critical'
                ? theme.colors.danger
                : insight.severity === 'warning'
                  ? theme.colors.warning
                  : theme.colors.info;
            const severityBg =
              insight.severity === 'critical'
                ? theme.colors.dangerLight
                : insight.severity === 'warning'
                  ? theme.colors.warningLight
                  : theme.colors.primaryLight;
            return (
              <View key={insight.id} style={styles.insightTileWrap}>
                <TouchableOpacity
                  style={styles.insightTile}
                  activeOpacity={0.7}
                  onPress={() => setExpandedId((prev) => (prev === insight.id ? null : insight.id))}
                >
                  <View style={styles.insightTileHeader}>
                    <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
                      <Ionicons
                        name={
                          insight.severity === 'critical'
                            ? 'alert-circle'
                            : insight.severity === 'warning'
                              ? 'warning'
                              : 'information-circle'
                        }
                        size={14}
                        color={severityColor}
                      />
                    </View>
                    <Text style={styles.insightTileTitle} numberOfLines={isExpanded ? undefined : 1}>
                      {insight.title}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={theme.colors.textTertiary}
                    />
                  </View>
                  <Text style={styles.insightTileSubtitle} numberOfLines={isExpanded ? undefined : 2}>
                    {insight.description}
                  </Text>
                  {insight.actionSuggestion && (
                    <View style={styles.insightTileAction}>
                      <Ionicons name="bulb-outline" size={13} color={theme.colors.primary} />
                      <Text style={styles.insightTileActionText} numberOfLines={isExpanded ? undefined : 1}>
                        {insight.actionSuggestion}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

        {!suppressDeterministicTiles && (
          <View style={styles.insightTileWrap}>
            <View style={styles.insightTile}>
              <View style={styles.insightTileHeader}>
                <View style={[styles.severityBadge, { backgroundColor: theme.colors.warningLight }]}>
                  <Ionicons name="bulb-outline" size={14} color={theme.colors.warning} />
                </View>
                <Text style={styles.insightTileTitle} numberOfLines={1}>
                  {t('analytics.dailyBudgetTip')}
                </Text>
              </View>
              <Text style={styles.insightTileSubtitle}>
                {t('analytics.dailyBudgetText', { amount: formatCurrency(summary.averagePerDay * 0.9, currency) })}
              </Text>
            </View>
          </View>
        )}

        {!suppressDeterministicTiles && summary.totalDiscountSavings > 0 && (
          <View style={styles.insightTileWrap}>
            <View style={styles.insightTile}>
              <View style={styles.insightTileHeader}>
                <View style={[styles.severityBadge, { backgroundColor: theme.colors.successLight }]}>
                  <Ionicons name="pricetag-outline" size={14} color={theme.colors.success} />
                </View>
                <Text style={styles.insightTileTitle} numberOfLines={1}>
                  {t('analytics.totalSavings')}
                </Text>
              </View>
              <Text style={styles.insightTileSubtitle}>
                {t('analytics.totalSavingsText', {
                  amount: formatCurrency(summary.totalDiscountSavings, currency),
                  range: t(`analytics.${selectedRange}`),
                })}
              </Text>
            </View>
          </View>
        )}

        {!suppressDeterministicTiles &&
          exhaustingPredictions.map((prediction) => (
            <View key={prediction.budgetId} style={styles.insightTileWrap}>
              <View style={styles.insightTile}>
                <View style={styles.insightTileHeader}>
                  <View style={[styles.severityBadge, { backgroundColor: theme.colors.dangerLight }]}>
                    <Ionicons name="time-outline" size={14} color={theme.colors.danger} />
                  </View>
                  <Text style={styles.insightTileTitle} numberOfLines={1}>
                    {prediction.budgetName}
                  </Text>
                </View>
                <Text style={styles.insightTileSubtitle}>
                  {t('insights.exhaustionText', {
                    date: new Date(prediction.estimatedExhaustionDate!).toLocaleDateString(getIntlLocale(), {
                      month: 'short',
                      day: 'numeric',
                    }),
                  })}
                </Text>
                <Text style={styles.insightTileSubtitle}>
                  {t('insights.projectedTotal', {
                    amount: formatCurrency(prediction.projectedTotal, prediction.currencyCode as any),
                  })}
                </Text>
              </View>
            </View>
          ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    // no marginBottom — the outer `body` container's own `gap` handles the
    // spacing between this and its siblings.
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  clusterHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  insightsCluster: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  insightTileWrap: {
    flexBasis: '48%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
  },
  insightTile: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    height: '100%' as const,
    ...theme.shadows.sm,
  },
  gatedTile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.warningLight,
    height: '100%' as const,
    ...theme.shadows.sm,
  },
  gatedChip: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  gatedChipText: {
    ...theme.textStyles.caption,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  insightTileHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  insightTileContent: {
    flex: 1,
    minWidth: 0,
  },
  severityBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  insightTileTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  insightTileSubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  insightTileAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  insightTileActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    flex: 1,
  },
});
