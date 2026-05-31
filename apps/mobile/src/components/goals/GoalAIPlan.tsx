import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { SavingsGoal, GoalCheckpoint, GoalCategoryLimit } from '@budget/shared-types';

interface GoalAIPlanProps {
  goal: SavingsGoal;
  isRegenerating: boolean;
  onRegenerate: () => void;
}

export function GoalAIPlan({ goal, isRegenerating, onRegenerate }: GoalAIPlanProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const formatAmount = (amount: number): string =>
    Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    const localeMap: Record<string, string> = {
      en: 'en-US',
      ru: 'ru-RU',
      de: 'de-DE',
      es: 'es-ES',
      fr: 'fr-FR',
      pl: 'pl-PL',
      ua: 'uk-UA',
      be: 'be-BY',
    };
    const locale = localeMap[i18n.language] || 'en-US';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFeasibilityColor = (feasibility: string): string => {
    switch (feasibility) {
      case 'easy': return theme.colors.success;
      case 'moderate': return theme.colors.warning;
      case 'challenging': return '#F97316';
      case 'unrealistic': return theme.colors.danger;
      default: return theme.colors.textTertiary;
    }
  };

  const getFeasibilityBackgroundColor = (feasibility: string): string => {
    switch (feasibility) {
      case 'easy': return theme.colors.primaryLight;
      case 'moderate': return theme.colors.warningLight;
      case 'challenging': return theme.colors.warningLight;
      case 'unrealistic': return theme.colors.dangerLight;
      default: return theme.colors.surfaceSecondary;
    }
  };

  return (
    <>
      {goal.aiPlan && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>{t('goals.aiPlan') || 'AI Plan'}</Text>
            </View>
            <View
              style={[
                styles.feasibilityBadge,
                { backgroundColor: getFeasibilityBackgroundColor(goal.aiPlan.feasibility) },
              ]}
            >
              <Text
                style={[
                  styles.feasibilityText,
                  { color: getFeasibilityColor(goal.aiPlan.feasibility) },
                ]}
              >
                {t(`goals.feasibility.${goal.aiPlan.feasibility}`) || goal.aiPlan.feasibility}
              </Text>
            </View>
          </View>

          {/* Contribution amounts */}
          <View style={styles.contributionRow}>
            <View style={styles.contributionCard}>
              <Text style={styles.contributionLabel}>{t('goals.monthly') || 'Monthly'}</Text>
              <Text style={styles.contributionAmount}>
                {formatAmount(goal.aiPlan.monthlyContribution)}
              </Text>
              <Text style={styles.contributionCurrency}>{goal.currencyCode}</Text>
            </View>
            <View style={styles.contributionCard}>
              <Text style={styles.contributionLabel}>{t('goals.weekly') || 'Weekly'}</Text>
              <Text style={styles.contributionAmount}>
                {formatAmount(goal.aiPlan.weeklyContribution)}
              </Text>
              <Text style={styles.contributionCurrency}>{goal.currencyCode}</Text>
            </View>
          </View>

          {/* Summary */}
          {goal.aiPlan.summary && (
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryText}>{goal.aiPlan.summary}</Text>
            </View>
          )}

          {/* Checkpoints Timeline */}
          {goal.aiPlan.checkpoints && goal.aiPlan.checkpoints.length > 0 && (
            <View style={styles.checkpointsSection}>
              <Text style={styles.subsectionTitle}>
                {t('goals.checkpoints') || 'Checkpoints'}
              </Text>
              {goal.aiPlan.checkpoints.map((checkpoint: GoalCheckpoint, index: number) => {
                const isLast = index === goal.aiPlan!.checkpoints.length - 1;
                const reached = goal.currentAmount >= checkpoint.targetAmount;
                return (
                  <View key={index} style={styles.checkpointItem}>
                    <View style={styles.checkpointTimeline}>
                      <View
                        style={[
                          styles.checkpointDot,
                          { backgroundColor: reached ? theme.colors.success : theme.colors.progressTrack },
                        ]}
                      >
                        {reached && (
                          <Ionicons name="checkmark" size={10} color={theme.colors.textInverse} />
                        )}
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.checkpointLine,
                            { backgroundColor: reached ? theme.colors.success : theme.colors.progressTrack },
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.checkpointContent}>
                      <Text style={styles.checkpointLabel}>{checkpoint.label}</Text>
                      <View style={styles.checkpointMeta}>
                        <Text style={styles.checkpointDate}>{formatDate(checkpoint.date)}</Text>
                        <Text style={styles.checkpointAmount}>
                          {formatAmount(checkpoint.targetAmount)} {goal.currencyCode}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Category Limits Table */}
          {goal.aiPlan.categoryLimits && goal.aiPlan.categoryLimits.length > 0 && (
            <View style={styles.categoryLimitsSection}>
              <Text style={styles.subsectionTitle}>
                {t('goals.categoryLimits') || 'Suggested Category Limits'}
              </Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.tableCellCategory]} numberOfLines={1}>
                  {t('goals.category') || 'Category'}
                </Text>
                <Text style={[styles.tableHeaderText, styles.tableCellAmount]} numberOfLines={1}>
                  {t('goals.current') || 'Current'}
                </Text>
                <Text style={[styles.tableHeaderText, styles.tableCellAmount]} numberOfLines={1}>
                  {t('goals.suggested') || 'Suggested'}
                </Text>
                <Text style={[styles.tableHeaderText, styles.tableCellAmount]} numberOfLines={1}>
                  {t('goals.savings') || 'Savings'}
                </Text>
              </View>
              {goal.aiPlan.categoryLimits.map((limit: GoalCategoryLimit, index: number) => (
                <View
                  key={index}
                  style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}
                >
                  <Text style={[styles.tableCellText, styles.tableCellCategory]} numberOfLines={1}>
                    {limit.categoryName}
                  </Text>
                  <Text style={[styles.tableCellText, styles.tableCellAmount]}>
                    {formatAmount(limit.currentMonthly)}
                  </Text>
                  <Text style={[styles.tableCellText, styles.tableCellAmount, { color: theme.colors.primary }]}>
                    {formatAmount(limit.suggestedMonthly)}
                  </Text>
                  <Text style={[styles.tableCellText, styles.tableCellAmount, { color: theme.colors.success }]}>
                    {formatAmount(limit.savingsPerMonth)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Regenerate Plan Button */}
      <TouchableOpacity
        style={[styles.regenerateButton, isRegenerating && styles.regenerateButtonDisabled]}
        onPress={onRegenerate}
        disabled={isRegenerating}
      >
        {isRegenerating ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons name="refresh" size={20} color={theme.colors.primary} />
        )}
        <Text style={styles.regenerateButtonText}>
          {isRegenerating
            ? t('goals.regenerating') || 'Regenerating...'
            : t('goals.regeneratePlan') || 'Regenerate AI Plan'}
        </Text>
      </TouchableOpacity>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  sectionTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  feasibilityBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  feasibilityText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  contributionRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  contributionCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
  },
  contributionLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  contributionAmount: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  contributionCurrency: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  summaryContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  checkpointsSection: {
    marginTop: theme.spacing[2],
  },
  checkpointItem: {
    flexDirection: 'row' as const,
    minHeight: 56,
  },
  checkpointTimeline: {
    width: 24,
    alignItems: 'center' as const,
  },
  checkpointDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 1,
  },
  checkpointLine: {
    width: 2,
    flex: 1,
    marginTop: -1,
  },
  checkpointContent: {
    flex: 1,
    paddingLeft: theme.spacing[3],
    paddingBottom: theme.spacing[4],
  },
  checkpointLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  checkpointMeta: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  checkpointDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  checkpointAmount: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    fontWeight: '500' as const,
  },
  categoryLimitsSection: {
    marginTop: theme.spacing[2],
  },
  tableHeader: {
    flexDirection: 'row' as const,
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tableHeaderText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    fontWeight: '600' as const,
  },
  tableRow: {
    flexDirection: 'row' as const,
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  tableRowEven: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  tableCellCategory: {
    flex: 2,
    paddingRight: theme.spacing[2],
  },
  tableCellAmount: {
    flex: 1.5,
    textAlign: 'right' as const,
  },
  tableCellText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  regenerateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  regenerateButtonDisabled: {
    opacity: 0.6,
  },
  regenerateButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
