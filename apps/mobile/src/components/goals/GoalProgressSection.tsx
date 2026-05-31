import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { SavingsGoal } from '@budget/shared-types';

interface ProgressData {
  onTrack: boolean;
  projectedCompletionDate: string;
  monthlyNeeded: number;
  behindByAmount: number;
}

interface GoalProgressSectionProps {
  goal: SavingsGoal;
  progressData: ProgressData | null;
  onAddFunds: () => void;
  formatDate: (date: Date | string) => string;
  formatAmount: (amount: number) => string;
}

export function GoalProgressSection({
  goal,
  progressData,
  onAddFunds,
  formatDate,
  formatAmount,
}: GoalProgressSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const progress = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const progressPercent = Math.round(progress * 100);
  const progressColor =
    goal.status === 'completed'
      ? theme.colors.success
      : goal.status === 'failed'
        ? theme.colors.danger
        : theme.colors.primary;

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{t('goals.progress') || 'Progress'}</Text>

      <View style={styles.progressBarLarge}>
        <View
          style={[
            styles.progressFillLarge,
            { width: `${progressPercent}%`, backgroundColor: progressColor },
          ]}
        />
      </View>

      <View style={styles.progressLabels}>
        <Text style={styles.progressPercentLarge}>{progressPercent}%</Text>
        <Text style={styles.progressRemaining}>
          {formatAmount(goal.targetAmount - goal.currentAmount)} {goal.currencyCode}{' '}
          {t('goals.remaining') || 'remaining'}
        </Text>
      </View>

      {goal.status === 'active' && (
        <TouchableOpacity style={styles.addFundsButton} onPress={onAddFunds}>
          <Ionicons name="add-circle" size={20} color={theme.colors.textInverse} />
          <Text style={styles.addFundsButtonText}>{t('goals.addFunds') || 'Add Funds'}</Text>
        </TouchableOpacity>
      )}

      {progressData && (
        <View style={styles.trackingInfo}>
          <View style={styles.trackingRow}>
            <Ionicons
              name={progressData.onTrack ? 'checkmark-circle' : 'warning'}
              size={18}
              color={progressData.onTrack ? theme.colors.success : theme.colors.warning}
            />
            <Text
              style={[
                styles.trackingText,
                { color: progressData.onTrack ? theme.colors.success : theme.colors.warning },
              ]}
            >
              {progressData.onTrack
                ? t('goals.onTrack') || 'On track'
                : t('goals.behindSchedule') || 'Behind schedule'}
            </Text>
          </View>

          {progressData.projectedCompletionDate &&
            progressData.projectedCompletionDate !== 'N/A' && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('goals.projectedCompletion') || 'Projected completion'}
                </Text>
                <Text style={styles.detailValue}>
                  {formatDate(progressData.projectedCompletionDate)}
                </Text>
              </View>
            )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              {t('goals.monthlyNeeded') || 'Monthly needed'}
            </Text>
            <Text style={styles.detailValue}>
              {formatAmount(progressData.monthlyNeeded)} {goal.currencyCode}
            </Text>
          </View>

          {!progressData.onTrack && progressData.behindByAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('goals.behindBy') || 'Behind by'}</Text>
              <Text style={[styles.detailValue, { color: theme.colors.danger }]}>
                {formatAmount(progressData.behindByAmount)} {goal.currencyCode}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  progressBarLarge: {
    height: 12,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 6,
    overflow: 'hidden' as const,
    marginBottom: theme.spacing[3],
  },
  progressFillLarge: {
    height: '100%' as const,
    borderRadius: 6,
  },
  progressLabels: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  progressPercentLarge: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  progressRemaining: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  addFundsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  addFundsButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
  trackingInfo: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  trackingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  trackingText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  detailValue: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
});
