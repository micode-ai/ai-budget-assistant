import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useGoalStore } from '@/stores/goalStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
import { useEffect } from 'react';

export function GoalsCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { goals, isLoading, loadGoals } = useGoalStore();
  const { user } = useAuthStore();
  const currency = user?.currencyCode || 'USD';

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const activeGoals = goals.filter(g => g.status === 'active');

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (activeGoals.length === 0) {
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/goals/new')}>
        <View style={styles.chevronHint}>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </View>
        <View style={styles.emptyContent}>
          <Ionicons name="flag-outline" size={32} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>{t('goals.noActiveGoals')}</Text>
          <Text style={styles.emptySubtitle}>{t('goals.createYourFirstGoal')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const topGoal = activeGoals[0];
  const percentComplete = topGoal.targetAmount > 0
    ? (Number(topGoal.currentAmount) / Number(topGoal.targetAmount)) * 100
    : 0;
  const daysRemaining = Math.ceil((new Date(topGoal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/goals')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('goals.savingsGoals')}</Text>
      </View>
      <View style={styles.goalContent}>
        <Text style={styles.goalName} numberOfLines={1}>{topGoal.name}</Text>

        <View style={styles.amountRow}>
          <Text style={styles.currentAmount}>
            {formatCurrency(Number(topGoal.currentAmount), topGoal.currencyCode)}
          </Text>
          <Text style={styles.targetAmount}>
            {t('common.of')} {formatCurrency(Number(topGoal.targetAmount), topGoal.currencyCode)}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(percentComplete, 100)}%`,
                  backgroundColor: theme.colors.primary
                }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {percentComplete.toFixed(0)}% · {daysRemaining > 0
              ? t('goals.daysRemaining', { count: daysRemaining })
              : t('goals.overdue')
            }
          </Text>
        </View>

        {activeGoals.length > 1 && (
          <Text style={styles.moreGoals}>
            {t('goals.andMore', { count: activeGoals.length - 1 })}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.md,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  cardHeader: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  goalContent: {
    gap: theme.spacing[2],
  },
  goalName: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
  },
  currentAmount: {
    ...theme.textStyles.h3,
    color: theme.colors.primary,
    fontWeight: '700' as const,
  },
  targetAmount: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  progressContainer: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  moreGoals: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textLink,
    marginTop: theme.spacing[2],
  },
  emptyContent: {
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
  },
  emptyTitle: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
  },
  emptySubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
});
