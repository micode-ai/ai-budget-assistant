import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGoalStore } from '@/stores/goalStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { SavingsGoal, GoalStatus } from '@budget/shared-types';

export default function GoalsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { goals, isLoading, loadGoals } = useGoalStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadGoals();
    } finally {
      setRefreshing(false);
    }
  }, [loadGoals]);

  const getStatusColor = (status: GoalStatus): string => {
    switch (status) {
      case 'active':
        return theme.colors.success;
      case 'paused':
        return theme.colors.warning;
      case 'completed':
        return theme.colors.info;
      case 'failed':
        return theme.colors.danger;
      default:
        return theme.colors.textTertiary;
    }
  };

  const getStatusBackgroundColor = (status: GoalStatus): string => {
    switch (status) {
      case 'active':
        return theme.colors.primaryLight;
      case 'paused':
        return theme.colors.warningLight;
      case 'completed':
        return theme.colors.primaryLight;
      case 'failed':
        return theme.colors.dangerLight;
      default:
        return theme.colors.surfaceSecondary;
    }
  };

  const getFeasibilityColor = (feasibility: string): string => {
    switch (feasibility) {
      case 'easy':
        return theme.colors.success;
      case 'moderate':
        return theme.colors.warning;
      case 'challenging':
        return '#F97316';
      case 'unrealistic':
        return theme.colors.danger;
      default:
        return theme.colors.textTertiary;
    }
  };

  const getFeasibilityBackgroundColor = (feasibility: string): string => {
    switch (feasibility) {
      case 'easy':
        return theme.colors.primaryLight;
      case 'moderate':
        return theme.colors.warningLight;
      case 'challenging':
        return theme.colors.warningLight;
      case 'unrealistic':
        return theme.colors.dangerLight;
      default:
        return theme.colors.surfaceSecondary;
    }
  };

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
    return d.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderGoalCard = ({ item }: { item: SavingsGoal }) => {
    const progress =
      item.targetAmount > 0
        ? Math.min(item.currentAmount / item.targetAmount, 1)
        : 0;
    const progressPercent = Math.round(progress * 100);

    return (
      <TouchableOpacity
        style={styles.goalCard}
        onPress={() => router.push(`/goals/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.goalHeader}>
          <Text style={styles.goalName} numberOfLines={1}>
            {item.name}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusBackgroundColor(item.status) },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(item.status) },
              ]}
            >
              {t(`goals.status.${item.status}`) || item.status}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.currentAmount}>
            {Number(item.currentAmount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.targetAmount}>
            {' / '}
            {Number(item.targetAmount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            {item.currencyCode}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor:
                    item.status === 'completed'
                      ? theme.colors.success
                      : item.status === 'failed'
                        ? theme.colors.danger
                        : theme.colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progressPercent}%</Text>
        </View>

        <View style={styles.goalFooter}>
          <View style={styles.deadlineRow}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.deadlineText}>{formatDate(item.deadline)}</Text>
          </View>

          {item.aiPlan && (
            <View
              style={[
                styles.feasibilityBadge,
                {
                  backgroundColor: getFeasibilityBackgroundColor(
                    item.aiPlan.feasibility,
                  ),
                },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={12}
                color={getFeasibilityColor(item.aiPlan.feasibility)}
              />
              <Text
                style={[
                  styles.feasibilityText,
                  { color: getFeasibilityColor(item.aiPlan.feasibility) },
                ]}
              >
                {t(`goals.feasibility.${item.aiPlan.feasibility}`) ||
                  item.aiPlan.feasibility}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="flag-outline"
        size={64}
        color={theme.colors.textDisabled}
      />
      <Text style={styles.emptyTitle}>
        {t('goals.noGoals') || 'No savings goals yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {t('goals.noGoalsHint') ||
          'Create a goal to start tracking your savings'}
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/goals/new')}
      >
        <Ionicons
          name="add"
          size={20}
          color={theme.colors.textInverse}
        />
        <Text style={styles.emptyButtonText}>
          {t('goals.createGoal') || 'Create Goal'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen
        options={{
          title: t('goals.title') || 'Savings Goals',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/goals/new')}
              style={{ marginRight: 16 }}
            >
              <Ionicons
                name="add-circle"
                size={28}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          ),
        }}
      />

      {isLoading && goals.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={goals}
          renderItem={renderGoalCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={ListEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  listContent: {
    padding: theme.spacing[4],
    flexGrow: 1,
  },
  separator: {
    height: theme.spacing[3],
  },

  // Goal card
  goalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  goalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  goalName: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[3],
  },
  statusBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  statusText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },

  // Amount
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    marginBottom: theme.spacing[3],
  },
  currentAmount: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  targetAmount: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },

  // Progress
  progressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  progressBar: {
    flex: 1,
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
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    width: 40,
    textAlign: 'right' as const,
  },

  // Footer
  goalFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  deadlineRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  deadlineText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  feasibilityBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  feasibilityText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
    paddingTop: theme.spacing[12],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
  emptyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[2],
    marginTop: theme.spacing[6],
  },
  emptyButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
});
