import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export default function BudgetDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { budgets, deleteBudget, getBudgetProgress } = useBudgetStore();
  const budget = budgets.find((b) => b.id === id);
  const progress = budget ? getBudgetProgress(budget.id) : null;

  if (!budget) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
          <Text style={styles.notFoundText}>{t('budgetDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    Alert.alert(t('budgetDetail.deleteTitle'), t('budgetDetail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteBudget(budget.id);
          router.back();
        },
      },
    ]);
  };

  const percentUsed = progress?.percentageUsed || 0;
  const isOverBudget = progress?.isOverBudget || false;

  const progressColor = isOverBudget
    ? '#FF6B6B'
    : percentUsed > 80
      ? '#FFEAA7'
      : '#4ECDC4';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <Text style={styles.budgetName}>{budget.name}</Text>
          <View style={[styles.statusBadge, isOverBudget && styles.statusBadgeOver]}>
            <Text style={[styles.statusText, isOverBudget && styles.statusTextOver]}>
              {isOverBudget ? t('budgetDetail.overBudget') : t('budgetDetail.onTrack')}
            </Text>
          </View>
        </View>

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.amountRow}>
            <Text style={styles.spentAmount}>
              {formatCurrency(progress?.spent || 0, budget.currencyCode)}
            </Text>
            <Text style={styles.totalAmount}>
              of {formatCurrency(budget.amount, budget.currencyCode)}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(percentUsed, 100)}%`,
                    backgroundColor: progressColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.percentText}>{percentUsed.toFixed(0)}%</Text>
          </View>

          {progress && progress.remaining > 0 && (
            <Text style={styles.remainingText}>
              {formatCurrency(progress.remaining, budget.currencyCode)} remaining
            </Text>
          )}
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.period')}</Text>
            <Text style={styles.detailValue}>
              {budget.period.charAt(0).toUpperCase() + budget.period.slice(1)}
            </Text>
          </View>

          {budget.categoryId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('budgetDetail.category')}</Text>
              <Text style={styles.detailValue}>{budget.categoryId}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.alertThreshold')}</Text>
            <Text style={styles.detailValue}>{budget.alertThreshold}%</Text>
          </View>

          {progress && (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('budgetDetail.daysRemaining')}</Text>
                <Text style={styles.detailValue}>{progress.daysRemaining}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('budgetDetail.projectedTotal')}</Text>
                <Text
                  style={[
                    styles.detailValue,
                    progress.projectedTotal > budget.amount && { color: '#FF6B6B' },
                  ]}
                >
                  {formatCurrency(progress.projectedTotal, budget.currencyCode)}
                </Text>
              </View>
            </>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.status')}</Text>
            <Text style={[styles.detailValue, { color: budget.isActive ? '#4ECDC4' : '#999' }]}>
              {budget.isActive ? t('budgetDetail.active') : t('budgetDetail.inactive')}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash" size={20} color="#FF6B6B" />
            <Text style={styles.deleteButtonText}>{t('budgetDetail.deleteTitle')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notFoundText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  budgetName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#E8F8F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeOver: {
    backgroundColor: '#FFE5E5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  statusTextOver: {
    color: '#FF6B6B',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 16,
  },
  spentAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  totalAmount: {
    fontSize: 16,
    color: '#999',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  percentText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    width: 45,
    textAlign: 'right',
  },
  remainingText: {
    fontSize: 15,
    color: '#4ECDC4',
    marginTop: 12,
    fontWeight: '500',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#999',
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  actionsContainer: {
    marginTop: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
});
