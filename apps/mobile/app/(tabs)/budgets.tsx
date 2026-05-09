import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { Budget } from '@budget/shared-types';

export default function BudgetsScreen() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const { budgets, getBudgetProgress, loadBudgets } = useBudgetStore();
  const budgetsLoading = useBudgetStore((s) => s.isLoading);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // Local-first hydration: store reads SQLite immediately and refreshes from API in background.
  useEffect(() => {
    if (currentAccountId) loadBudgets();
  }, [currentAccountId, loadBudgets]);

  useFocusEffect(
    useCallback(() => {
      if (currentAccountId) loadBudgets();
    }, [currentAccountId, loadBudgets]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBudgets();
    } finally {
      setRefreshing(false);
    }
  }, [loadBudgets]);

  const renderBudgetItem = ({ item }: { item: Budget }) => {
    const progress = getBudgetProgress(item.id);
    const percentUsed = progress?.percentageUsed || 0;
    const isOverBudget = percentUsed > 100;

    return (
      <TouchableOpacity
        style={styles.budgetCard}
        onPress={() => router.push(`/budget/${item.id}`)}
      >
        <View style={styles.budgetHeader}>
          <View style={styles.budgetInfo}>
            <Text style={styles.budgetName}>{item.name}</Text>
            <Text style={styles.budgetPeriod}>{t(`budgets.periods.${item.period}`)}</Text>
          </View>
          <View style={[styles.statusBadge, isOverBudget && styles.statusBadgeOver]}>
            <Text style={[styles.statusText, isOverBudget && styles.statusTextOver]}>
              {isOverBudget ? t('budgets.overBudget') : t('budgets.onTrack')}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.spentText}>
            {formatCurrency(progress?.spent || 0, item.currencyCode)} {t('budgets.spent')}
          </Text>
          <Text style={styles.budgetText}>
            {t('common.of')} {formatCurrency(item.amount, item.currencyCode)}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(percentUsed, 100)}%`,
                  backgroundColor: isOverBudget ? theme.colors.danger : percentUsed > 80 ? theme.colors.warning : theme.colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{percentUsed.toFixed(0)}%</Text>
        </View>

        {progress && progress.remaining > 0 && (
          <Text style={styles.remainingText}>
            {formatCurrency(progress.remaining, item.currencyCode)} {t('budgets.remaining')}
          </Text>
        )}

        {progress?.estimatedExhaustionDate && (
          <View style={styles.predictionRow}>
            <Ionicons name="time-outline" size={14} color={theme.colors.warning} />
            <Text style={styles.predictionText}>
              {t('insights.exhaustionText', {
                date: new Date(progress.estimatedExhaustionDate).toLocaleDateString(getIntlLocale(), {
                  month: 'short',
                  day: 'numeric',
                }),
              })}
            </Text>
          </View>
        )}

        {progress && progress.projectedTotal > item.amount && !isOverBudget && (
          <Text style={styles.projectedText}>
            {t('insights.projectedTotal', {
              amount: formatCurrency(progress.projectedTotal, item.currencyCode),
            })}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const visibleBudgets = budgets.filter((b) => !b.isDeleted && b.accountId === currentAccountId);

  const ListEmptyComponent = () => {
    if (budgetsLoading && visibleBudgets.length === 0) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="wallet-outline" size={64} color={theme.colors.textDisabled} />
        <Text style={styles.emptyTitle}>{t('budgets.noBudgets')}</Text>
        <Text style={styles.emptySubtitle}>
          {t('budgets.createHint')}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/budget/new')}
        >
          <Text style={styles.addButtonText}>{t('budgets.createBudget')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={visibleBudgets}
        renderItem={renderBudgetItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={ListEmptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Floating Action Button (hidden for viewers) */}
      {canEdit && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/budget/new')}
        >
          <Ionicons name="add" size={28} color={theme.colors.textInverse} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: 100,
    flexGrow: 1,
  },
  budgetCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    ...theme.shadows.md,
  },
  budgetHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: theme.spacing[4],
  },
  budgetInfo: {
    flex: 1,
  },
  budgetName: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  budgetPeriod: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    textTransform: 'capitalize' as const,
  },
  statusBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  statusBadgeOver: {
    backgroundColor: theme.colors.dangerLight,
  },
  statusText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  statusTextOver: {
    color: theme.colors.danger,
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  spentText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  budgetText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    flexShrink: 0,
  },
  progressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
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
  remainingText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
    marginTop: theme.spacing[3],
  },
  predictionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  predictionText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
  },
  projectedText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  separator: {
    height: theme.spacing[3],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    fontSize: 20,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
  },
  emptySubtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[6],
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius['3xl'],
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  fab: {
    position: 'absolute' as const,
    right: theme.spacing[5],
    bottom: theme.spacing[5],
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...theme.shadows.xl,
  },
});
