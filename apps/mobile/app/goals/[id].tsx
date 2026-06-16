import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGoalStore } from '@/stores/goalStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { SavingsGoal, GoalStatus, GoalContribution } from '@budget/shared-types';
import { GoalAddFundsModal } from '@/components/goals/GoalAddFundsModal';
import { GoalAIPlan } from '@/components/goals/GoalAIPlan';
import { GoalProgressSection } from '@/components/goals/GoalProgressSection';

interface ProgressData {
  goal: SavingsGoal;
  percentComplete: number;
  onTrack: boolean;
  projectedCompletionDate: string;
  monthlyNeeded: number;
  behindByAmount: number;
}

export default function GoalDetailScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { goals, contributions, deleteGoal, getProgress, regeneratePlan, updateGoal, loadContributions } = useGoalStore();

  const goal = goals.find((g) => g.id === id);
  const goalContributions: GoalContribution[] = contributions[id ?? ''] ?? [];
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);

  const loadProgressData = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getProgress(id);
      setProgressData(data);
    } catch {
      // Progress data is supplemental; silently fail
    }
  }, [id, getProgress]);

  useEffect(() => {
    loadProgressData();
    if (id) loadContributions(id);
  }, [loadProgressData, id, loadContributions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProgressData();
    } finally {
      setRefreshing(false);
    }
  }, [loadProgressData]);

  const handleDelete = () => {
    showAlert(
      t('goals.deleteTitle') || 'Delete Goal',
      t('goals.deleteConfirm') || `Are you sure you want to delete "${goal?.name}"?`,
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGoal(id!);
              setTimeout(() => router.back(), 0);
            } catch {
              showAlert(t('common.error'), t('goals.errorDelete') || 'Failed to delete goal');
            }
          },
        },
      ],
    );
  };

  const handleRegenerate = async () => {
    if (!id) return;
    setIsRegenerating(true);
    try {
      await regeneratePlan(id);
      await loadProgressData();
    } catch {
      showAlert(
        t('common.error'),
        t('goals.errorRegenerate') || 'Failed to regenerate plan',
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleAddFunds = async (amount: number) => {
    if (!id || !goal) return;
    const newAmount = goal.currentAmount + amount;
    try {
      await updateGoal(id, { currentAmount: newAmount });
      await Promise.all([loadProgressData(), loadContributions(id)]);
      setShowAddFunds(false);
    } catch {
      showAlert(t('common.error'), t('goals.errorAddFunds') || 'Failed to add funds');
    }
  };

  const getStatusColor = (status: GoalStatus): string => {
    switch (status) {
      case 'active': return theme.colors.success;
      case 'paused': return theme.colors.warning;
      case 'completed': return theme.colors.info;
      case 'failed': return theme.colors.danger;
      default: return theme.colors.textTertiary;
    }
  };

  const getStatusBackgroundColor = (status: GoalStatus): string => {
    switch (status) {
      case 'active': return theme.colors.primaryLight;
      case 'paused': return theme.colors.warningLight;
      case 'completed': return theme.colors.primaryLight;
      case 'failed': return theme.colors.dangerLight;
      default: return theme.colors.surfaceSecondary;
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    const localeMap: Record<string, string> = {
      en: 'en-US', ru: 'ru-RU', de: 'de-DE', es: 'es-ES',
      fr: 'fr-FR', pl: 'pl-PL', ua: 'uk-UA', be: 'be-BY',
    };
    const locale = localeMap[i18n.language] || 'en-US';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatAmount = (amount: number): string =>
    Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (!goal) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: t('goals.goalDetail') || 'Goal' }} />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('goals.notFound') || 'Goal not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back') || 'Go Back'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: goal.name,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 12, marginRight: 16 }}>
              <TouchableOpacity onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Goal Info Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.goalName}>{goal.name}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusBackgroundColor(goal.status) },
              ]}
            >
              <Text style={[styles.statusText, { color: getStatusColor(goal.status) }]}>
                {t(`goals.status.${goal.status}`) || goal.status}
              </Text>
            </View>
          </View>

          <View style={styles.headerAmounts}>
            <Text style={styles.headerCurrentAmount}>{formatAmount(goal.currentAmount)}</Text>
            <Text style={styles.headerTargetAmount}>
              {' / '}
              {formatAmount(goal.targetAmount)} {goal.currencyCode}
            </Text>
          </View>

          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.textTertiary} />
              <Text style={styles.metaText}>{formatDate(goal.deadline)}</Text>
            </View>
          </View>
        </View>

        <GoalProgressSection
          goal={goal}
          progressData={progressData}
          onAddFunds={() => setShowAddFunds(true)}
          formatDate={formatDate}
          formatAmount={formatAmount}
        />

        {/* Contribution History */}
        <View style={styles.contributionsCard}>
          <View style={styles.contributionHeader}>
            <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.contributionTitle}>{t('goals.contributionsTitle') || 'Contribution History'}</Text>
          </View>
          {goalContributions.length === 0 ? (
            <Text style={styles.contributionEmpty}>{t('goals.noContributions') || 'No contributions recorded yet.'}</Text>
          ) : (
            goalContributions.map((c) => (
              <View key={c.id} style={styles.contributionRow}>
                <View style={styles.contributionLeft}>
                  <Text style={styles.contributionAmount}>
                    +{formatAmount(c.amount)} {c.currencyCode}
                  </Text>
                  {c.note ? (
                    <Text style={styles.contributionNote}>{t('goals.contributionNote', { note: c.note }) || c.note}</Text>
                  ) : null}
                </View>
                <Text style={styles.contributionDate}>{formatDate(c.createdAt)}</Text>
              </View>
            ))
          )}
        </View>

        <GoalAIPlan
          goal={goal}
          isRegenerating={isRegenerating}
          onRegenerate={handleRegenerate}
        />

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color={theme.colors.danger} />
          <Text style={styles.deleteButtonText}>{t('goals.deleteGoal') || 'Delete Goal'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <GoalAddFundsModal
        visible={showAddFunds}
        onClose={() => setShowAddFunds(false)}
        onConfirm={handleAddFunds}
        currentAmount={goal.currentAmount}
        currencyCode={goal.currencyCode}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  notFoundText: {
    fontSize: 18,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[4],
  },
  backButton: {
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  backButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  headerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  headerTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  goalName: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[3],
  },
  statusBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  headerAmounts: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    marginBottom: theme.spacing[3],
  },
  headerCurrentAmount: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
  headerTargetAmount: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },
  headerMeta: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  metaItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  metaText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  deleteButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.danger,
  },
  contributionsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  contributionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  contributionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  contributionEmpty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  contributionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  contributionLeft: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  contributionAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.success,
  },
  contributionNote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  contributionDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
});
