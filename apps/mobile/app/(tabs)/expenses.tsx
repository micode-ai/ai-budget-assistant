import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Animated } from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import type { Expense } from '@budget/shared-types';

export default function ExpensesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const { expenses, isLoading } = useExpenseStore();
  const fabAnimation = useRef(new Animated.Value(0)).current;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Trigger sync
    setRefreshing(false);
  }, []);

  const toggleFab = () => {
    const toValue = fabOpen ? 0 : 1;
    Animated.spring(fabAnimation, {
      toValue,
      friction: 6,
      useNativeDriver: true,
    }).start();
    setFabOpen(!fabOpen);
  };

  const handleAddExpense = () => {
    setFabOpen(false);
    fabAnimation.setValue(0);
    router.push('/expense/new');
  };

  const handleVoiceInput = () => {
    setFabOpen(false);
    fabAnimation.setValue(0);
    router.push('/expense/voice');
  };

  const handleScanReceipt = () => {
    setFabOpen(false);
    fabAnimation.setValue(0);
    router.push('/expense/receipt');
  };

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => router.push(`/expense/${item.id}`)}
    >
      <View style={styles.expenseIcon}>
        <Ionicons name="receipt-outline" size={24} color="#4ECDC4" />
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(item.date)}</Text>
        {item.syncStatus !== 'synced' && (
          <View style={styles.syncBadge}>
            <Ionicons
              name={item.syncStatus === 'pending' ? 'cloud-upload-outline' : 'alert-circle-outline'}
              size={12}
              color={item.syncStatus === 'pending' ? '#999' : '#FF6B6B'}
            />
            <Text style={styles.syncText}>{item.syncStatus}</Text>
          </View>
        )}
      </View>
      <Text style={styles.expenseAmount}>
        -{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No expenses yet</Text>
      <Text style={styles.emptySubtitle}>
        Add your first expense by tapping the + button
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/expense/new')}
      >
        <Text style={styles.addButtonText}>Add Expense</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={expenses}
        renderItem={renderExpenseItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={ListEmptyComponent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Floating Action Button with Menu */}
      {fabOpen && (
        <TouchableOpacity
          style={styles.fabOverlay}
          activeOpacity={1}
          onPress={toggleFab}
        />
      )}

      <View style={styles.fabContainer}>
        {/* Receipt Button */}
        <Animated.View
          style={[
            styles.fabOption,
            {
              transform: [
                {
                  translateY: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -180],
                  }),
                },
                {
                  scale: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ],
              opacity: fabAnimation,
            },
          ]}
        >
          <TouchableOpacity style={styles.fabOptionButton} onPress={handleScanReceipt}>
            <Ionicons name="camera" size={22} color="#fff" />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            Scan Receipt
          </Animated.Text>
        </Animated.View>

        {/* Voice Button */}
        <Animated.View
          style={[
            styles.fabOption,
            {
              transform: [
                {
                  translateY: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -120],
                  }),
                },
                {
                  scale: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ],
              opacity: fabAnimation,
            },
          ]}
        >
          <TouchableOpacity style={[styles.fabOptionButton, { backgroundColor: '#96CEB4' }]} onPress={handleVoiceInput}>
            <Ionicons name="mic" size={22} color="#fff" />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            Voice Input
          </Animated.Text>
        </Animated.View>

        {/* Manual Button */}
        <Animated.View
          style={[
            styles.fabOption,
            {
              transform: [
                {
                  translateY: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -60],
                  }),
                },
                {
                  scale: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ],
              opacity: fabAnimation,
            },
          ]}
        >
          <TouchableOpacity style={[styles.fabOptionButton, { backgroundColor: '#4ECDC4' }]} onPress={handleAddExpense}>
            <Ionicons name="create" size={22} color="#fff" />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            Manual Entry
          </Animated.Text>
        </Animated.View>

        {/* Main FAB */}
        <TouchableOpacity style={styles.fab} onPress={toggleFab} activeOpacity={0.9}>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>
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
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  expenseIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F8F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseDetails: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  expenseDate: {
    fontSize: 14,
    color: '#999',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  syncText: {
    fontSize: 12,
    color: '#999',
    textTransform: 'capitalize',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  separator: {
    height: 8,
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
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    alignItems: 'flex-end',
  },
  fab: {
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
  fabOption: {
    position: 'absolute',
    right: 4,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabOptionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#45B7D1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabOptionLabel: {
    position: 'absolute',
    right: 58,
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    overflow: 'hidden',
  },
});
