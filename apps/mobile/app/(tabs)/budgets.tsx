import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '@/stores/budgetStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Budget } from '@budget/shared-types';

export default function BudgetsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { budgets, getBudgetProgress } = useBudgetStore();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Trigger sync
    setRefreshing(false);
  }, []);

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
            <Text style={styles.budgetPeriod}>{item.period}</Text>
          </View>
          <View style={[styles.statusBadge, isOverBudget && styles.statusBadgeOver]}>
            <Text style={[styles.statusText, isOverBudget && styles.statusTextOver]}>
              {isOverBudget ? 'Over Budget' : 'On Track'}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.spentText}>
            {formatCurrency(progress?.spent || 0, item.currencyCode)} spent
          </Text>
          <Text style={styles.budgetText}>
            of {formatCurrency(item.amount, item.currencyCode)}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(percentUsed, 100)}%`,
                  backgroundColor: isOverBudget ? '#FF6B6B' : percentUsed > 80 ? '#FFEAA7' : '#4ECDC4',
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{percentUsed.toFixed(0)}%</Text>
        </View>

        {progress && progress.remaining > 0 && (
          <Text style={styles.remainingText}>
            {formatCurrency(progress.remaining, item.currencyCode)} remaining
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="wallet-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No budgets set</Text>
      <Text style={styles.emptySubtitle}>
        Create a budget to start tracking your spending limits
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/budget/new')}
      >
        <Text style={styles.addButtonText}>Create Budget</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={budgets.filter(b => !b.isDeleted)}
        renderItem={renderBudgetItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={ListEmptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/budget/new')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  budgetCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  budgetPeriod: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textTransform: 'capitalize',
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 12,
  },
  spentText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  budgetText: {
    fontSize: 16,
    color: '#999',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 40,
    textAlign: 'right',
  },
  remainingText: {
    fontSize: 14,
    color: '#4ECDC4',
    marginTop: 12,
    fontWeight: '500',
  },
  separator: {
    height: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
