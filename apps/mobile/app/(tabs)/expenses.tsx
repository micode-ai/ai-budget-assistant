import { View, Text, FlatList, TouchableOpacity, RefreshControl, Animated, ScrollView, Image, Alert } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Expense, Income } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { TransactionActionSheet } from '@/components/TransactionActionSheet';

type ActiveTab = 'expenses' | 'income';
type DateRange = 'week' | 'month' | 'year' | 'all' | 'custom';

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (tab === 'income' || tab === 'expenses') {
      setActiveTab(tab);
    }
  }, [tab]);
  const { loadExpenses, getFilteredExpenses, deleteExpense, filters: expenseFilters, setFilters: setExpenseFilters } = useExpenseStore();
  const { loadIncomes, getFilteredIncomes, deleteIncome, filters: incomeFilters, setFilters: setIncomeFilters } = useIncomeStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenses = getFilteredExpenses();
  const incomes = getFilteredIncomes();
  const allCategories = useCategoryStore((s) => s.categories);
  const categories = allCategories.filter(
    (c) => c.type === (activeTab === 'expenses' ? 'expense' : 'income') && !c.isDeleted
  );
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [selectedTransaction, setSelectedTransaction] = useState<{
    id: string;
    type: 'expense' | 'income';
    amount?: number;
    description?: string;
    categoryId?: string;
    currencyCode?: string;
  } | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'expenses') {
        await loadExpenses();
      } else {
        await loadIncomes();
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses, loadIncomes, activeTab]);

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

  const handleLongPress = (item: Expense | Income, type: 'expense' | 'income') => {
    setSelectedTransaction({
      id: item.id,
      type,
      amount: item.amount,
      description: item.description || undefined,
      categoryId: item.categoryId || undefined,
      currencyCode: item.currencyCode,
    });
    setActionSheetVisible(true);
  };

  const handleEdit = () => {
    if (!selectedTransaction) return;
    const path = selectedTransaction.type === 'expense' ? '/expense' : '/income';
    if (canEdit) {
      router.push({ pathname: `${path}/${selectedTransaction.id}`, params: { edit: 'true' } });
    } else {
      router.push(`${path}/${selectedTransaction.id}`);
    }
  };

  const handleDuplicate = () => {
    if (!selectedTransaction) return;
    const path = selectedTransaction.type === 'expense' ? '/expense/new' : '/income/new';
    router.push({
      pathname: path,
      params: {
        amount: selectedTransaction.amount?.toString() || '',
        description: selectedTransaction.description || '',
        categoryId: selectedTransaction.categoryId || '',
        currencyCode: selectedTransaction.currencyCode || '',
      },
    });
  };

  const handleDeleteFromList = () => {
    if (!selectedTransaction) return;
    Alert.alert(
      t('common.deleteConfirmTitle'),
      t('common.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            if (selectedTransaction.type === 'expense') {
              deleteExpense(selectedTransaction.id);
            } else {
              deleteIncome(selectedTransaction.id);
            }
          },
        },
      ],
    );
  };

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => router.push(`/expense/${item.id}`)}
      onLongPress={() => handleLongPress(item, 'expense')}
      delayLongPress={400}
    >
      <View style={styles.expenseIcon}>
        {item.source === 'ocr' ? (
          <Image
            source={require('../../assets/icons/scan-receipt.png')}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
          />
        ) : (
          <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
        )}
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
      </View>
      <Text style={styles.expenseAmount}>
        -{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );

  const renderIncomeItem = ({ item }: { item: Income }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => router.push(`/income/${item.id}`)}
      onLongPress={() => handleLongPress(item, 'income')}
      delayLongPress={400}
    >
      <View style={[styles.expenseIcon, { backgroundColor: theme.colors.success + '18' }]}>
        <Ionicons name="trending-up-outline" size={24} color={theme.colors.success} />
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseDescription} numberOfLines={1}>
          {item.description || 'Income'}
        </Text>
        <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
      </View>
      <Text style={[styles.expenseAmount, { color: theme.colors.success }]}>
        +{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );

  const ExpenseEmptyComponent = () => (
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

  const IncomeEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons name="trending-up-outline" size={64} color={theme.colors.textDisabled} />
      <Text style={styles.emptyTitle}>{t('incomes.noIncomes')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('incomes.addFirst')}
      </Text>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.colors.success }]}
        onPress={() => router.push('/income/new')}
      >
        <Text style={styles.addButtonText}>{t('incomes.addIncome')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Segmented Control */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentButton, activeTab === 'expenses' && styles.segmentButtonActive]}
          onPress={() => { setActiveTab('expenses'); setIncomeFilters({ categoryId: null }); setShowCategoryPicker(false); }}
        >
          <Text style={[styles.segmentText, activeTab === 'expenses' && styles.segmentTextActive]}>
            {t('expenses.tabExpenses')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, activeTab === 'income' && styles.segmentButtonActive]}
          onPress={() => { setActiveTab('income'); setExpenseFilters({ categoryId: null }); setShowCategoryPicker(false); }}
        >
          <Text style={[styles.segmentText, activeTab === 'income' && styles.segmentTextActive]}>
            {t('expenses.tabIncome')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Period Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodFilterScroll} contentContainerStyle={styles.periodFilterRow}>
        {(['week', 'month', 'year', 'all', 'custom'] as DateRange[]).map((range) => {
          const currentFilters = activeTab === 'expenses' ? expenseFilters : incomeFilters;
          const isActive = currentFilters.dateRange === range;
          return (
            <TouchableOpacity
              key={range}
              style={[styles.periodChip, isActive && styles.periodChipActive]}
              onPress={() => {
                const now = new Date();
                const update = range === 'custom'
                  ? { dateRange: range as DateRange, customMonth: now.getMonth(), customYear: now.getFullYear() }
                  : { dateRange: range as DateRange };
                if (activeTab === 'expenses') {
                  setExpenseFilters(update);
                } else {
                  setIncomeFilters(update);
                }
              }}
            >
              <Text style={[styles.periodChipText, isActive && styles.periodChipTextActive]}>
                {t(`expenses.period${range.charAt(0).toUpperCase()}${range.slice(1)}` as any)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Category Filter */}
      {(() => {
        const currentFilters = activeTab === 'expenses' ? expenseFilters : incomeFilters;
        const isExpense = activeTab === 'expenses';
        const selectedCategory = categories.find((c) => c.id === currentFilters.categoryId);
        const hasFilter = currentFilters.categoryId !== null;
        return (
          <View style={styles.categoryFilterWrapper}>
            <TouchableOpacity
              style={[styles.categoryFilterButton, hasFilter && (isExpense ? styles.categoryFilterButtonActive : styles.categoryFilterButtonActiveIncome)]}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              {selectedCategory?.icon ? (
                <Ionicons
                  name={selectedCategory.icon as any}
                  size={14}
                  color={hasFilter ? (isExpense ? theme.colors.primary : theme.colors.success) : theme.colors.textTertiary}
                />
              ) : (
                <Ionicons name="pricetag-outline" size={14} color={hasFilter ? (isExpense ? theme.colors.primary : theme.colors.success) : theme.colors.textTertiary} />
              )}
              <Text style={[styles.categoryFilterButtonText, hasFilter && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                {selectedCategory ? selectedCategory.name : t('expenses.categoryAll')}
              </Text>
              <Ionicons name={showCategoryPicker ? 'chevron-up' : 'chevron-down'} size={14} color={hasFilter ? (isExpense ? theme.colors.primary : theme.colors.success) : theme.colors.textTertiary} />
            </TouchableOpacity>

            {showCategoryPicker && (
              <View style={styles.categoryPickerContainer}>
                <ScrollView style={styles.categoryPickerScroll} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[styles.categoryPickerItem, !hasFilter && styles.categoryPickerItemSelected]}
                    onPress={() => {
                      if (isExpense) setExpenseFilters({ categoryId: null });
                      else setIncomeFilters({ categoryId: null });
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Ionicons name="list-outline" size={18} color={!hasFilter ? (isExpense ? theme.colors.primary : theme.colors.success) : theme.colors.textSecondary} />
                    <Text style={[styles.categoryPickerItemText, !hasFilter && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                      {t('expenses.categoryAll')}
                    </Text>
                    {!hasFilter && <Ionicons name="checkmark" size={18} color={isExpense ? theme.colors.primary : theme.colors.success} style={styles.categoryPickerCheck} />}
                  </TouchableOpacity>
                  {categories.map((cat) => {
                    const isSelected = currentFilters.categoryId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.categoryPickerItem, isSelected && styles.categoryPickerItemSelected]}
                        onPress={() => {
                          if (isExpense) setExpenseFilters({ categoryId: cat.id });
                          else setIncomeFilters({ categoryId: cat.id });
                          setShowCategoryPicker(false);
                        }}
                      >
                        {cat.icon ? (
                          <Ionicons name={cat.icon as any} size={18} color={isSelected ? (isExpense ? theme.colors.primary : theme.colors.success) : theme.colors.textSecondary} />
                        ) : (
                          <Ionicons name="pricetag-outline" size={18} color={isSelected ? (isExpense ? theme.colors.primary : theme.colors.success) : theme.colors.textSecondary} />
                        )}
                        <Text style={[styles.categoryPickerItemText, isSelected && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                          {cat.name}
                        </Text>
                        {isSelected && <Ionicons name="checkmark" size={18} color={isExpense ? theme.colors.primary : theme.colors.success} style={styles.categoryPickerCheck} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        );
      })()}

      {/* Month/Year Navigator (visible when custom is selected) */}
      {(() => {
        const currentFilters = activeTab === 'expenses' ? expenseFilters : incomeFilters;
        const setCurrentFilters = activeTab === 'expenses' ? setExpenseFilters : setIncomeFilters;
        if (currentFilters.dateRange !== 'custom') return null;

        const m = currentFilters.customMonth ?? new Date().getMonth();
        const y = currentFilters.customYear ?? new Date().getFullYear();
        const monthLabel = t(`analytics.months.${MONTH_KEYS[m]}` as any);

        const goPrev = () => {
          const prevMonth = m === 0 ? 11 : m - 1;
          const prevYear = m === 0 ? y - 1 : y;
          setCurrentFilters({ customMonth: prevMonth, customYear: prevYear });
        };
        const goNext = () => {
          const nextMonth = m === 11 ? 0 : m + 1;
          const nextYear = m === 11 ? y + 1 : y;
          setCurrentFilters({ customMonth: nextMonth, customYear: nextYear });
        };

        return (
          <View style={styles.monthNavigator}>
            <TouchableOpacity onPress={goPrev} style={styles.monthNavButton}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthNavLabel}>{monthLabel} {y}</Text>
            <TouchableOpacity onPress={goNext} style={styles.monthNavButton}>
              <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        );
      })()}

      {activeTab === 'expenses' ? (
        <FlatList
          data={expenses}
          renderItem={renderExpenseItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={ExpenseEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={incomes}
          renderItem={renderIncomeItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={IncomeEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Floating Action Button (hidden for viewers) */}
      {activeTab === 'income' && canEdit && (
        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: theme.colors.success }]}
            onPress={() => router.push('/income/new')}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={28} color={theme.colors.textInverse} />
          </TouchableOpacity>
        </View>
      )}

      {fabOpen && canEdit && activeTab === 'expenses' && (
        <TouchableOpacity
          style={styles.fabOverlay}
          activeOpacity={1}
          onPress={toggleFab}
        />
      )}

      {canEdit && activeTab === 'expenses' && <View style={styles.fabContainer}>
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
            <Ionicons name="qr-code" size={22} color={theme.colors.textInverse} />
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
            <Ionicons name="radio" size={22} color={theme.colors.textInverse} />
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
      <TransactionActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDeleteFromList}
        canEdit={canEdit}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  segmentedControl: {
    flexDirection: 'row' as const,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  segmentText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  periodFilterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  periodFilterRow: {
    flexDirection: 'row' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  periodChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['3xl'],
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  periodChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  periodChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  periodChipTextActive: {
    color: theme.colors.primary,
  },
  categoryChipTextActive: {
    color: theme.colors.primary,
  },
  categoryChipTextActiveIncome: {
    color: theme.colors.success,
  },
  categoryFilterWrapper: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    zIndex: 10,
  },
  categoryFilterButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    alignSelf: 'flex-start' as const,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['3xl'],
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  categoryFilterButtonActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  categoryFilterButtonActiveIncome: {
    backgroundColor: theme.colors.success + '18',
    borderColor: theme.colors.success,
  },
  categoryFilterButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  categoryPickerContainer: {
    marginTop: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
    ...theme.shadows.md,
  },
  categoryPickerScroll: {
    maxHeight: 300,
  },
  categoryPickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  categoryPickerItemSelected: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  categoryPickerItemText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  categoryPickerCheck: {},
  monthNavigator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[3],
  },
  monthNavButton: {
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  monthNavLabel: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    minWidth: 120,
    textAlign: 'center' as const,
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
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.sm,
    color: theme.colors.textPrimary,
    ...theme.textStyles.bodySmMedium,
    overflow: 'hidden' as const,
    ...theme.shadows.md,
  },
});
