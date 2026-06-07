import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Animated,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { sumConverted } from '@/utils/total';
import type { Expense, Income } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { TransactionActionSheet } from '@/components/TransactionActionSheet';
import { useTagStore } from '@/stores/tagStore';
import { useExpenseMultiSelect } from '@/hooks/useExpenseMultiSelect';
import { ExpenseListItem } from '@/components/expenses/ExpenseListItem';
import { IncomeListItem } from '@/components/expenses/IncomeListItem';
import { ExpenseFilterBar } from '@/components/expenses/ExpenseFilterBar';
import { BulkTagPickerSheet } from '@/components/BulkTagPickerSheet';

type ActiveTab = 'expenses' | 'income';

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  const {
    loadExpenses,
    getFilteredExpenses,
    getDistinctMerchants,
    deleteExpense,
    filters: expenseFilters,
    setFilters: setExpenseFilters,
    bulkUpdateExpenses,
  } = useExpenseStore();
  const { loadIncomes, getFilteredIncomes, deleteIncome, filters: incomeFilters, setFilters: setIncomeFilters } =
    useIncomeStore();

  const expensesLoading = useExpenseStore((s) => s.isLoading);
  const incomesLoading = useIncomeStore((s) => s.isLoading);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const expenses = getFilteredExpenses();
  const incomes = getFilteredIncomes();
  const rates = useExchangeRateStore((s) => s.rates);
  const baseCurrencyRaw = useExchangeRateStore((s) => s.baseCurrency);
  const baseCurrency = baseCurrencyRaw || 'USD';
  const filteredTotal = sumConverted(activeTab === 'expenses' ? expenses : incomes, baseCurrency, rates);
  const allCategories = useCategoryStore((s) => s.categories);
  const categories = allCategories.filter(
    (c) => c.type === (activeTab === 'expenses' ? 'expense' : 'income') && !c.isDeleted
  );
  const merchantList = getDistinctMerchants();
  const allTags = useTagStore((s) => s.tags);
  const loadTags = useTagStore((s) => s.loadTags);
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

  const multiSelect = useExpenseMultiSelect(expenses, bulkUpdateExpenses);

  useEffect(() => {
    if (tab === 'income' || tab === 'expenses') {
      setActiveTab(tab);
    }
  }, [tab]);

  useEffect(() => {
    if (currentAccountId) {
      hydrateTransactions();
      loadTags();
    }
  }, [currentAccountId]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (activeTab === 'expenses') {
      setExpenseFilters({ searchQuery: text });
    } else {
      setIncomeFilters({ searchQuery: text });
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setExpenseFilters({ searchQuery: '' });
    setIncomeFilters({ searchQuery: '' });
    searchInputRef.current?.focus();
  };

  const toggleSearch = () => {
    if (searchVisible) {
      setSearchVisible(false);
      setSearchQuery('');
      setExpenseFilters({ searchQuery: '' });
      setIncomeFilters({ searchQuery: '' });
    } else {
      setSearchVisible(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  const switchTab = (nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    multiSelect.exitMultiSelect();
    setSearchVisible(false);
    setSearchQuery('');
    setExpenseFilters({ searchQuery: '' });
    setIncomeFilters({ searchQuery: '' });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'expenses') {
        await loadExpenses({ force: true });
      } else {
        await loadIncomes({ force: true });
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadExpenses, loadIncomes, activeTab]);

  const toggleFab = () => {
    const toValue = fabOpen ? 0 : 1;
    Animated.spring(fabAnimation, { toValue, friction: 6, useNativeDriver: true }).start();
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
    showAlert(t('common.deleteConfirmTitle'), t('common.deleteConfirmMessage'), [
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
    ]);
  };

  const renderExpenseItem = useCallback(
    ({ item }: { item: Expense }) => (
      <ExpenseListItem
        item={item}
        isMultiSelect={multiSelect.isMultiSelect}
        isSelected={multiSelect.selectedIds.has(item.id)}
        onToggleSelect={multiSelect.toggleSelection}
        onLongPress={(e) => handleLongPress(e, 'expense')}
      />
    ),
    [multiSelect.isMultiSelect, multiSelect.selectedIds, multiSelect.toggleSelection]
  );

  const renderIncomeItem = useCallback(
    ({ item }: { item: Income }) => (
      <IncomeListItem item={item} onLongPress={(i) => handleLongPress(i, 'income')} />
    ),
    []
  );

  const ExpenseEmptyComponent = () => {
    if (expensesLoading && expenses.length === 0) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={64} color={theme.colors.textDisabled} />
        <Text style={styles.emptyTitle}>{t('expenses.noExpenses')}</Text>
        <Text style={styles.emptySubtitle}>{t('expenses.addFirst')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/expense/new')}>
          <Text style={styles.addButtonText}>{t('expenses.addExpense')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const IncomeEmptyComponent = () => {
    if (incomesLoading && incomes.length === 0) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="trending-up-outline" size={64} color={theme.colors.textDisabled} />
        <Text style={styles.emptyTitle}>{t('incomes.noIncomes')}</Text>
        <Text style={styles.emptySubtitle}>{t('incomes.addFirst')}</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.colors.success }]}
          onPress={() => router.push('/income/new')}
        >
          <Text style={styles.addButtonText}>{t('incomes.addIncome')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header: multi-select bar OR segmented control */}
      {multiSelect.isMultiSelect ? (
        <View style={styles.multiSelectHeader}>
          <TouchableOpacity onPress={multiSelect.exitMultiSelect} style={styles.multiSelectCancel}>
            <Text style={styles.multiSelectCancelText}>{t('expenses.bulkCancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.multiSelectCount}>
            {t('expenses.bulkSelected', { count: multiSelect.selectedIds.size })}
          </Text>
          <TouchableOpacity onPress={multiSelect.selectAll} style={styles.multiSelectSelectAll}>
            <Text style={styles.multiSelectSelectAllText}>{t('expenses.bulkSelectAll')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.segmentedControlRow}>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentButton, activeTab === 'expenses' && styles.segmentButtonActive]}
              onPress={() => switchTab('expenses')}
            >
              <Text style={[styles.segmentText, activeTab === 'expenses' && styles.segmentTextActive]}>
                {t('expenses.tabExpenses')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, activeTab === 'income' && styles.segmentButtonActive]}
              onPress={() => switchTab('income')}
            >
              <Text style={[styles.segmentText, activeTab === 'income' && styles.segmentTextActive]}>
                {t('expenses.tabIncome')}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={toggleSearch} style={styles.searchToggleButton}>
            <Ionicons
              name={searchVisible ? 'close' : 'search'}
              size={20}
              color={searchVisible ? theme.colors.primary : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Search bar */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={theme.colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder={t('expenses.searchPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.searchClearButton}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Period chips + category/merchant filters + month navigator */}
      <ExpenseFilterBar
        activeTab={activeTab}
        expenseFilters={expenseFilters}
        setExpenseFilters={setExpenseFilters}
        incomeFilters={incomeFilters}
        setIncomeFilters={setIncomeFilters}
        categories={categories}
        merchantList={merchantList}
        filteredTotal={filteredTotal}
        baseCurrency={baseCurrency}
      />

      {/* Transaction list */}
      {activeTab === 'expenses' ? (
        <FlatList
          data={expenses}
          renderItem={renderExpenseItem}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={ExpenseEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={incomes}
          renderItem={renderIncomeItem}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={IncomeEmptyComponent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Income FAB */}
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

      {/* Expense FAB overlay + options */}
      {fabOpen && canEdit && activeTab === 'expenses' && (
        <TouchableOpacity style={styles.fabOverlay} activeOpacity={1} onPress={toggleFab} />
      )}

      {canEdit && activeTab === 'expenses' && !multiSelect.isMultiSelect && (
        <View style={styles.fabContainer}>
          <Animated.View
            style={[
              styles.fabOption,
              {
                transform: [
                  { translateY: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -180] }) },
                  { scale: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                ],
                opacity: fabAnimation,
              },
            ]}
          >
            <TouchableOpacity style={styles.fabOptionButton} onPress={handleScanReceipt}>
              <Ionicons name="qr-code" size={22} color={theme.colors.textInverse} />
            </TouchableOpacity>
            <Animated.Text style={[styles.fabOptionLabel, { opacity: fabAnimation }]}>
              {t('expenses.scanReceipt')}
            </Animated.Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.fabOption,
              {
                transform: [
                  { translateY: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) },
                  { scale: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                ],
                opacity: fabAnimation,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.fabOptionButton, { backgroundColor: theme.colors.accent }]}
              onPress={handleVoiceInput}
            >
              <Ionicons name="radio" size={22} color={theme.colors.textInverse} />
            </TouchableOpacity>
            <Animated.Text style={[styles.fabOptionLabel, { opacity: fabAnimation }]}>
              {t('expenses.voiceInput')}
            </Animated.Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.fabOption,
              {
                transform: [
                  { translateY: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
                  { scale: fabAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                ],
                opacity: fabAnimation,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.fabOptionButton, { backgroundColor: theme.colors.primary }]}
              onPress={handleAddExpense}
            >
              <Ionicons name="create" size={22} color={theme.colors.textInverse} />
            </TouchableOpacity>
            <Animated.Text style={[styles.fabOptionLabel, { opacity: fabAnimation }]}>
              {t('expenses.manualEntry')}
            </Animated.Text>
          </Animated.View>

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
        </View>
      )}

      {/* Bulk action bar */}
      {multiSelect.isMultiSelect && (
        <View style={styles.bulkActionBar}>
          {multiSelect.isBulkProcessing ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={() => {
                  multiSelect.setShowBulkTagPicker(false);
                  multiSelect.setShowBulkCategoryPicker(true);
                }}
                disabled={multiSelect.selectedIds.size === 0}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={20}
                  color={multiSelect.selectedIds.size > 0 ? theme.colors.primary : theme.colors.textDisabled}
                />
                <Text
                  style={[
                    styles.bulkActionText,
                    multiSelect.selectedIds.size === 0 && styles.bulkActionTextDisabled,
                  ]}
                >
                  {t('expenses.bulkSetCategory')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={() => {
                  multiSelect.setShowBulkCategoryPicker(false);
                  multiSelect.setShowBulkTagPicker(true);
                }}
                disabled={multiSelect.selectedIds.size === 0}
              >
                <Ionicons
                  name="bookmark-outline"
                  size={20}
                  color={multiSelect.selectedIds.size > 0 ? theme.colors.accent : theme.colors.textDisabled}
                />
                <Text
                  style={[
                    styles.bulkActionText,
                    multiSelect.selectedIds.size === 0 && styles.bulkActionTextDisabled,
                  ]}
                >
                  {t('expenses.bulkAddTag')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={multiSelect.handleBulkDelete}
                disabled={multiSelect.selectedIds.size === 0}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={multiSelect.selectedIds.size > 0 ? theme.colors.danger : theme.colors.textDisabled}
                />
                <Text
                  style={[
                    styles.bulkActionText,
                    { color: multiSelect.selectedIds.size > 0 ? theme.colors.danger : theme.colors.textDisabled },
                  ]}
                >
                  {t('expenses.bulkDelete')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Bulk category picker modal */}
      <Modal
        visible={multiSelect.showBulkCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => multiSelect.setShowBulkCategoryPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => multiSelect.setShowBulkCategoryPicker(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                {t('expenses.bulkSetCategory')}
              </Text>
              <TouchableOpacity onPress={() => multiSelect.setShowBulkCategoryPicker(false)}>
                <Text style={[styles.modalAction, { color: theme.colors.primary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {categories.filter((c) => !c.isDeleted).map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.modalRow, { borderBottomColor: theme.colors.divider }]}
                  onPress={() => multiSelect.handleBulkSetCategory(cat.id)}
                >
                  <Ionicons
                    name={(cat.icon as any) || 'pricetag-outline'}
                    size={18}
                    color={theme.colors.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.modalRowText, { color: theme.colors.textPrimary }]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
              {categories.filter((c) => !c.isDeleted).length === 0 && (
                <Text style={[styles.modalEmpty, { color: theme.colors.textTertiary }]}>
                  {t('expenses.categoryAll')}
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk tag picker modal */}
      <Modal
        visible={multiSelect.showBulkTagPicker}
        transparent
        animationType="slide"
        onRequestClose={() => multiSelect.setShowBulkTagPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => multiSelect.setShowBulkTagPicker(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.surface }]}>
            <BulkTagPickerSheet
              tags={allTags}
              onConfirm={multiSelect.handleBulkAddTags}
              onClose={() => multiSelect.setShowBulkTagPicker(false)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Long-press action sheet */}
      <TransactionActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDeleteFromList}
        canEdit={canEdit}
        onSelectMultiple={
          selectedTransaction?.type === 'expense'
            ? () => {
                multiSelect.enterMultiSelect(selectedTransaction.id);
                setFabOpen(false);
                fabAnimation.setValue(0);
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  segmentedControlRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
    gap: theme.spacing[2],
  },
  segmentedControl: {
    flex: 1,
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  searchToggleButton: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  searchIcon: {
    marginRight: theme.spacing[2],
  },
  searchInput: {
    flex: 1,
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  searchClearButton: {
    marginLeft: theme.spacing[1],
    padding: 2,
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
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: 100,
    flexGrow: 1 as const,
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
  multiSelectHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginHorizontal: theme.spacing[4],
    ...theme.shadows.sm,
  },
  multiSelectCancel: {
    minWidth: 60,
  },
  multiSelectCancelText: {
    fontSize: 15,
    color: theme.colors.primary,
  },
  multiSelectCount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  multiSelectSelectAll: {
    minWidth: 60,
    alignItems: 'flex-end' as const,
  },
  multiSelectSelectAllText: {
    fontSize: 15,
    color: theme.colors.primary,
  },
  bulkActionBar: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  bulkActionButton: {
    flex: 1,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  bulkActionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  bulkActionTextDisabled: {
    color: theme.colors.textDisabled,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end' as const,
  },
  modalSheet: {
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[10],
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  modalAction: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  modalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
  },
  modalRowText: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  modalEmpty: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
});
