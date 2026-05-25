import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGoalStore } from '@/stores/goalStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { SavingsGoal, GoalStatus, GoalCheckpoint, GoalCategoryLimit } from '@budget/shared-types';

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
  const { goals, deleteGoal, getProgress, regeneratePlan, updateGoal } =
    useGoalStore();

  const goal = goals.find((g) => g.id === id);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [isAddingFunds, setIsAddingFunds] = useState(false);

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
  }, [loadProgressData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProgressData();
    } finally {
      setRefreshing(false);
    }
  }, [loadProgressData]);

  const handleDelete = () => {
    Alert.alert(
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
              Alert.alert(
                t('common.error'),
                t('goals.errorDelete') || 'Failed to delete goal',
              );
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
      Alert.alert(
        t('common.error'),
        t('goals.errorRegenerate') || 'Failed to regenerate plan',
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleAddFunds = async () => {
    const amount = parseFloat(fundAmount);
    if (!id || !goal || isNaN(amount) || amount <= 0) return;

    setIsAddingFunds(true);
    try {
      const newAmount = goal.currentAmount + amount;
      await updateGoal(id, { currentAmount: newAmount });
      await loadProgressData();
      setFundAmount('');
      setShowAddFunds(false);
    } catch {
      Alert.alert(
        t('common.error'),
        t('goals.errorAddFunds') || 'Failed to add funds',
      );
    } finally {
      setIsAddingFunds(false);
    }
  };

  const handleCloseAddFunds = () => {
    setFundAmount('');
    setShowAddFunds(false);
  };

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
    // Map i18n language codes to BCP 47 locale codes
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

  const formatAmount = (amount: number): string => {
    return Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (!goal) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: t('goals.goalDetail') || 'Goal' }} />
        <View style={styles.centered}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={theme.colors.textDisabled}
          />
          <Text style={styles.notFoundText}>
            {t('goals.notFound') || 'Goal not found'}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>
              {t('common.back') || 'Go Back'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress =
    goal.targetAmount > 0
      ? Math.min(goal.currentAmount / goal.targetAmount, 1)
      : 0;
  const progressPercent = Math.round(progress * 100);
  const progressColor =
    goal.status === 'completed'
      ? theme.colors.success
      : goal.status === 'failed'
        ? theme.colors.danger
        : theme.colors.primary;

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
              <Text
                style={[
                  styles.statusText,
                  { color: getStatusColor(goal.status) },
                ]}
              >
                {t(`goals.status.${goal.status}`) || goal.status}
              </Text>
            </View>
          </View>

          <View style={styles.headerAmounts}>
            <Text style={styles.headerCurrentAmount}>
              {formatAmount(goal.currentAmount)}
            </Text>
            <Text style={styles.headerTargetAmount}>
              {' / '}
              {formatAmount(goal.targetAmount)} {goal.currencyCode}
            </Text>
          </View>

          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={theme.colors.textTertiary}
              />
              <Text style={styles.metaText}>{formatDate(goal.deadline)}</Text>
            </View>
          </View>
        </View>

        {/* Progress Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {t('goals.progress') || 'Progress'}
          </Text>

          <View style={styles.progressBarLarge}>
            <View
              style={[
                styles.progressFillLarge,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: progressColor,
                },
              ]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressPercentLarge}>{progressPercent}%</Text>
            <Text style={styles.progressRemaining}>
              {formatAmount(goal.targetAmount - goal.currentAmount)}{' '}
              {goal.currencyCode} {t('goals.remaining') || 'remaining'}
            </Text>
          </View>

          {goal.status === 'active' && (
            <TouchableOpacity
              style={styles.addFundsButton}
              onPress={() => setShowAddFunds(true)}
            >
              <Ionicons name="add-circle" size={20} color={theme.colors.textInverse} />
              <Text style={styles.addFundsButtonText}>
                {t('goals.addFunds') || 'Add Funds'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Progress tracking info */}
          {progressData && (
            <View style={styles.trackingInfo}>
              <View style={styles.trackingRow}>
                <Ionicons
                  name={progressData.onTrack ? 'checkmark-circle' : 'warning'}
                  size={18}
                  color={
                    progressData.onTrack
                      ? theme.colors.success
                      : theme.colors.warning
                  }
                />
                <Text
                  style={[
                    styles.trackingText,
                    {
                      color: progressData.onTrack
                        ? theme.colors.success
                        : theme.colors.warning,
                    },
                  ]}
                >
                  {progressData.onTrack
                    ? t('goals.onTrack') || 'On track'
                    : t('goals.behindSchedule') || 'Behind schedule'}
                </Text>
              </View>

              {progressData.projectedCompletionDate && progressData.projectedCompletionDate !== 'N/A' && (
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
                  <Text style={styles.detailLabel}>
                    {t('goals.behindBy') || 'Behind by'}
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.colors.danger }]}>
                    {formatAmount(progressData.behindByAmount)} {goal.currencyCode}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* AI Plan Section */}
        {goal.aiPlan && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="sparkles"
                  size={20}
                  color={theme.colors.primary}
                />
                <Text style={styles.sectionTitle}>
                  {t('goals.aiPlan') || 'AI Plan'}
                </Text>
              </View>
              <View
                style={[
                  styles.feasibilityBadge,
                  {
                    backgroundColor: getFeasibilityBackgroundColor(
                      goal.aiPlan.feasibility,
                    ),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.feasibilityText,
                    {
                      color: getFeasibilityColor(goal.aiPlan.feasibility),
                    },
                  ]}
                >
                  {t(`goals.feasibility.${goal.aiPlan.feasibility}`) ||
                    goal.aiPlan.feasibility}
                </Text>
              </View>
            </View>

            {/* Contribution amounts */}
            <View style={styles.contributionRow}>
              <View style={styles.contributionCard}>
                <Text style={styles.contributionLabel}>
                  {t('goals.monthly') || 'Monthly'}
                </Text>
                <Text style={styles.contributionAmount}>
                  {formatAmount(goal.aiPlan.monthlyContribution)}
                </Text>
                <Text style={styles.contributionCurrency}>
                  {goal.currencyCode}
                </Text>
              </View>
              <View style={styles.contributionCard}>
                <Text style={styles.contributionLabel}>
                  {t('goals.weekly') || 'Weekly'}
                </Text>
                <Text style={styles.contributionAmount}>
                  {formatAmount(goal.aiPlan.weeklyContribution)}
                </Text>
                <Text style={styles.contributionCurrency}>
                  {goal.currencyCode}
                </Text>
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
                {goal.aiPlan.checkpoints.map(
                  (checkpoint: GoalCheckpoint, index: number) => {
                    const isLast =
                      index === goal.aiPlan!.checkpoints.length - 1;
                    const checkpointReached =
                      goal.currentAmount >= checkpoint.targetAmount;

                    return (
                      <View key={index} style={styles.checkpointItem}>
                        <View style={styles.checkpointTimeline}>
                          <View
                            style={[
                              styles.checkpointDot,
                              {
                                backgroundColor: checkpointReached
                                  ? theme.colors.success
                                  : theme.colors.progressTrack,
                              },
                            ]}
                          >
                            {checkpointReached && (
                              <Ionicons
                                name="checkmark"
                                size={10}
                                color={theme.colors.textInverse}
                              />
                            )}
                          </View>
                          {!isLast && (
                            <View
                              style={[
                                styles.checkpointLine,
                                {
                                  backgroundColor: checkpointReached
                                    ? theme.colors.success
                                    : theme.colors.progressTrack,
                                },
                              ]}
                            />
                          )}
                        </View>
                        <View style={styles.checkpointContent}>
                          <Text style={styles.checkpointLabel}>
                            {checkpoint.label}
                          </Text>
                          <View style={styles.checkpointMeta}>
                            <Text style={styles.checkpointDate}>
                              {formatDate(checkpoint.date)}
                            </Text>
                            <Text style={styles.checkpointAmount}>
                              {formatAmount(checkpoint.targetAmount)}{' '}
                              {goal.currencyCode}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  },
                )}
              </View>
            )}

            {/* Category Limits Table */}
            {goal.aiPlan.categoryLimits &&
              goal.aiPlan.categoryLimits.length > 0 && (
                <View style={styles.categoryLimitsSection}>
                  <Text style={styles.subsectionTitle}>
                    {t('goals.categoryLimits') || 'Suggested Category Limits'}
                  </Text>

                  {/* Table header */}
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

                  {goal.aiPlan.categoryLimits.map(
                    (limit: GoalCategoryLimit, index: number) => (
                      <View
                        key={index}
                        style={[
                          styles.tableRow,
                          index % 2 === 0 && styles.tableRowEven,
                        ]}
                      >
                        <Text
                          style={[styles.tableCellText, styles.tableCellCategory]}
                          numberOfLines={1}
                        >
                          {limit.categoryName}
                        </Text>
                        <Text style={[styles.tableCellText, styles.tableCellAmount]}>
                          {formatAmount(limit.currentMonthly)}
                        </Text>
                        <Text
                          style={[
                            styles.tableCellText,
                            styles.tableCellAmount,
                            { color: theme.colors.primary },
                          ]}
                        >
                          {formatAmount(limit.suggestedMonthly)}
                        </Text>
                        <Text
                          style={[
                            styles.tableCellText,
                            styles.tableCellAmount,
                            { color: theme.colors.success },
                          ]}
                        >
                          {formatAmount(limit.savingsPerMonth)}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              )}
          </View>
        )}

        {/* Regenerate Plan Button */}
        <TouchableOpacity
          style={[
            styles.regenerateButton,
            isRegenerating && styles.regenerateButtonDisabled,
          ]}
          onPress={handleRegenerate}
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

        {/* Delete action */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color={theme.colors.danger} />
          <Text style={styles.deleteButtonText}>
            {t('goals.deleteGoal') || 'Delete Goal'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Funds Modal */}
      <Modal visible={showAddFunds} transparent animationType="slide" onRequestClose={handleCloseAddFunds}>
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleCloseAddFunds} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {t('goals.addFunds') || 'Add Funds'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {t('goals.addFundsDescription') || 'How much have you saved?'}
            </Text>

            <TextInput
              style={styles.modalAmountInput}
              value={fundAmount}
              onChangeText={setFundAmount}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={styles.modalCurrentInfo}>
              {t('goals.currentSaved') || 'Currently saved'}:{' '}
              {formatAmount(goal?.currentAmount ?? 0)} {goal?.currencyCode}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={handleCloseAddFunds}>
                <Text style={styles.modalCancelText}>{t('common.cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (!fundAmount || parseFloat(fundAmount) <= 0 || isAddingFunds) && styles.modalConfirmButtonDisabled,
                ]}
                onPress={handleAddFunds}
                disabled={!fundAmount || parseFloat(fundAmount) <= 0 || isAddingFunds}
              >
                {isAddingFunds ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {t('goals.addFundsConfirm') || 'Add'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  // Header card
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

  // Section card
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

  // Progress bar (large)
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

  // Tracking info
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

  // Feasibility badge
  feasibilityBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  feasibilityText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },

  // Contribution cards
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

  // Summary
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

  // Checkpoints timeline
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

  // Category limits table
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

  // Regenerate button
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

  // Delete button
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

  // Add Funds button
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

  // Add Funds modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  modalBackdrop: {
    ...({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    } as const),
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[8],
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[5],
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[5],
  },
  modalAmountInput: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[3],
  },
  modalCurrentInfo: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[5],
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
    alignItems: 'center' as const,
  },
  modalConfirmButtonDisabled: {
    opacity: 0.5,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
});
