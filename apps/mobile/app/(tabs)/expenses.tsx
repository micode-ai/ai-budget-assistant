import { View, Text, FlatList, TouchableOpacity, RefreshControl, Animated } from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import type { Expense } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const { isLoading, loadExpenses, getFilteredExpenses } = useExpenseStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenses = getFilteredExpenses();
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadExpenses();
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses]);

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
        <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(item.date)}</Text>
      </View>
      <Text style={styles.expenseAmount}>
        -{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('expenses.noExpenses')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('expenses.addFirst')}
      </Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/expense/new')}
      >
        <Text style={styles.addButtonText}>{t('expenses.addExpense')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
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

      {/* Floating Action Button with Menu (hidden for viewers) */}
      {fabOpen && canEdit && (
        <TouchableOpacity
          style={styles.fabOverlay}
          activeOpacity={1}
          onPress={toggleFab}
        />
      )}

      {canEdit && <View style={styles.fabContainer}>
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
            <Ionicons name="camera" size={22} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            {t('expenses.scanReceipt')}
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
          <TouchableOpacity style={[styles.fabOptionButton, { backgroundColor: theme.colors.accent }]} onPress={handleVoiceInput}>
            <Ionicons name="mic" size={22} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            {t('expenses.voiceInput')}
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
          <TouchableOpacity style={[styles.fabOptionButton, { backgroundColor: theme.colors.primary }]} onPress={handleAddExpense}>
            <Ionicons name="create" size={22} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.fabOptionLabel,
              {
                opacity: fabAnimation,
              },
            ]}
          >
            {t('expenses.manualEntry')}
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
            <Ionicons name="add" size={28} color={theme.colors.textInverse} />
          </Animated.View>
        </TouchableOpacity>
      </View>}
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
    flexGrow: 1 as const,
  },
  expenseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  expenseIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[3],
  },
  expenseDetails: {
    flex: 1,
  },
  expenseDescription: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  expenseDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  expenseAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.danger,
  },
  separator: {
    height: theme.spacing[2],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[8],
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
  fabOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.scrim,
  },
  fabContainer: {
    position: 'absolute' as const,
    right: theme.spacing[5],
    bottom: theme.spacing[5],
    alignItems: 'flex-end' as const,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...theme.shadows.xl,
  },
  fabOption: {
    position: 'absolute' as const,
    right: 4,
    bottom: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  fabOptionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...theme.shadows.lg,
  },
  fabOptionLabel: {
    position: 'absolute' as const,
    right: 58,
    backgroundColor: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textInverse,
    ...theme.textStyles.bodySmMedium,
    overflow: 'hidden' as const,
  },
});
