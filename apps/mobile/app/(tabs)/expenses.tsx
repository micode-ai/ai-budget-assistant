import { View, Text, FlatList, TouchableOpacity, RefreshControl, Animated, ScrollView, Image, Alert, ActivityIndicator, TextInput, Modal } from 'react-native';
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
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Expense, Income } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { TransactionActionSheet } from '@/components/TransactionActionSheet';
import { useTagStore } from '@/stores/tagStore';

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
  const [showMerchantPicker, setShowMerchantPicker] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  // Multi-select mode (expenses tab only)
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false);
  const [showBulkTagPicker, setShowBulkTagPicker] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const { loadExpenses, getFilteredExpenses, getDistinctMerchants, deleteExpense, filters: expenseFilters, setFilters: setExpenseFilters, bulkUpdateExpenses } = useExpenseStore();
  const { loadIncomes, getFilteredIncomes, deleteIncome, filters: incomeFilters, setFilters: setIncomeFilters } = useIncomeStore();

  useEffect(() => {
    if (tab === 'income' || tab === 'expenses') {
      setActiveTab(tab);
    }
  }, [tab]);

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
    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setShowBulkCategoryPicker(false);
    setShowBulkTagPicker(false);
    setSearchVisible(false);
    setSearchQuery('');
    setExpenseFilters({ searchQuery: '' });
    setIncomeFilters({ searchQuery: '' });
    setShowCategoryPicker(false);
    setShowMerchantPicker(false);
  };
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

  useEffect(() => {
    if (currentAccountId) {
      hydrateTransactions();
      // Tags power the bulk-tag picker; load them here so it isn't empty when
      // the user opens it without first visiting the tags reference screen.
      loadTags();
    }
  }, [currentAccountId]);

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

  const enterMultiSelect = (firstId: string) => {
    setIsMultiSelect(true);
    setSelectedIds(new Set([firstId]));
    setFabOpen(false);
    fabAnimation.setValue(0);
    setShowCategoryPicker(false);
  };

  const exitMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setShowBulkCategoryPicker(false);
    setShowBulkTagPicker(false);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) setIsMultiSelect(false);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(expenses.map((e) => e.id)));
  };

  const handleBulkSetCategory = async (categoryId: string) => {
    if (selectedIds.size === 0) return;
    setShowBulkCategoryPicker(false);
    setIsBulkProcessing(true);
    try {
      await bulkUpdateExpenses(Array.from(selectedIds), { categoryId });
      Alert.alert('', t('expenses.bulkCategoryApplied', { count: selectedIds.size }));
      exitMultiSelect();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkAddTags = async (tagIds: string[]) => {
    if (selectedIds.size === 0 || tagIds.length === 0) return;
    setShowBulkTagPicker(false);
    setIsBulkProcessing(true);
    try {
      await bulkUpdateExpenses(Array.from(selectedIds), { tagIds });
      Alert.alert('', t('expenses.bulkTagsApplied', { count: selectedIds.size }));
      exitMultiSelect();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('expenses.bulkDeleteConfirm', { count: selectedIds.size }),
      t('expenses.bulkDeleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('expenses.bulkDelete'),
          style: 'destructive',
          onPress: async () => {
            setIsBulkProcessing(true);
            try {
              await bulkUpdateExpenses(Array.from(selectedIds), { isDeleted: true });
              Alert.alert('', t('expenses.bulkDeleted', { count: selectedIds.size }));
              exitMultiSelect();
            } finally {
              setIsBulkProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleLongPress = (item: Expense | Income, type: 'expense' | 'income') => {
    if (type === 'expense' && canEdit) {
      enterMultiSelect(item.id);
      return;
    }
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

  const renderExpenseItem = ({ item }: { item: Expense }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.expenseCard, isMultiSelect && isSelected && styles.expenseCardSelected]}
        onPress={() => {
          if (isMultiSelect) {
            toggleSelection(item.id);
          } else {
            router.push(`/expense/${item.id}`);
          }
        }}
        onLongPress={() => handleLongPress(item, 'expense')}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        {isMultiSelect && (
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={14} color={theme.colors.textInverse} />}
            </View>
          </View>
        )}
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
          {item.merchant ? (
            <Text style={styles.expenseMerchant} numberOfLines={1}>{item.merchant}</Text>
          ) : null}
          <Text style={styles.expenseDate}>{formatDate(item.date, undefined, getIntlLocale())}</Text>
        </View>
        <Text style={styles.expenseAmount}>
          -{formatCurrency(item.amount, item.currencyCode)}
        </Text>
      </TouchableOpacity>
    );
  };

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

  const LoadingState = () => (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  const ExpenseEmptyComponent = () => {
    if (expensesLoading && expenses.length === 0) return <LoadingState />;
    return (
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
  };

  const IncomeEmptyComponent = () => {
    if (incomesLoading && incomes.length === 0) return <LoadingState />;
    return (
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
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Multi-select header / Segmented Control */}
      {isMultiSelect ? (
        <View style={styles.multiSelectHeader}>
          <TouchableOpacity onPress={exitMultiSelect} style={styles.multiSelectCancel}>
            <Text style={styles.multiSelectCancelText}>{t('expenses.bulkCancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.multiSelectCount}>
            {t('expenses.bulkSelected', { count: selectedIds.size })}
          </Text>
          <TouchableOpacity onPress={selectAll} style={styles.multiSelectSelectAll}>
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

      {/* Search Bar */}
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

      {/* Filter row: category + merchant pills + filtered total */}
      {(() => {
        const isExpense = activeTab === 'expenses';
        const currentFilters = isExpense ? expenseFilters : incomeFilters;
        const selectedCategory = categories.find((c) => c.id === currentFilters.categoryId);
        const hasCat = currentFilters.categoryId !== null;
        const hasMerchants = expenseFilters.merchants.length > 0;
        const accent = isExpense ? theme.colors.primary : theme.colors.success;
        return (
          <>
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.categoryFilterButton, styles.filterPill, hasCat && (isExpense ? styles.categoryFilterButtonActive : styles.categoryFilterButtonActiveIncome)]}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              >
                <Ionicons name={(selectedCategory?.icon as any) || 'pricetag-outline'} size={14} color={hasCat ? accent : theme.colors.textTertiary} />
                <Text style={[styles.categoryFilterButtonText, styles.filterPillText, hasCat && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]} numberOfLines={1}>
                  {selectedCategory ? selectedCategory.name : t('expenses.categoryAll')}
                </Text>
                <Ionicons name={showCategoryPicker ? 'chevron-up' : 'chevron-down'} size={14} color={hasCat ? accent : theme.colors.textTertiary} />
              </TouchableOpacity>

              {isExpense && (
                <TouchableOpacity
                  style={[styles.categoryFilterButton, styles.filterPill, hasMerchants && styles.categoryFilterButtonActive]}
                  onPress={() => setShowMerchantPicker(true)}
                >
                  <Ionicons name="storefront-outline" size={14} color={hasMerchants ? theme.colors.primary : theme.colors.textTertiary} />
                  <Text style={[styles.categoryFilterButtonText, styles.filterPillText, hasMerchants && styles.categoryChipTextActive]} numberOfLines={1}>
                    {hasMerchants ? t('expenses.merchantsSelected', { count: expenseFilters.merchants.length }) : t('expenses.merchantAll')}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={hasMerchants ? theme.colors.primary : theme.colors.textTertiary} />
                </TouchableOpacity>
              )}

              <Text style={styles.filterTotal} numberOfLines={1}>
                {formatCurrency(filteredTotal, baseCurrency)}
              </Text>
            </View>

            {showCategoryPicker && (
              <View style={styles.categoryFilterWrapper}>
                <View style={styles.categoryPickerContainer}>
                  <ScrollView style={styles.categoryPickerScroll} nestedScrollEnabled>
                    <TouchableOpacity
                      style={[styles.categoryPickerItem, !hasCat && styles.categoryPickerItemSelected]}
                      onPress={() => {
                        if (isExpense) setExpenseFilters({ categoryId: null });
                        else setIncomeFilters({ categoryId: null });
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Ionicons name="list-outline" size={18} color={!hasCat ? accent : theme.colors.textSecondary} />
                      <Text style={[styles.categoryPickerItemText, !hasCat && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                        {t('expenses.categoryAll')}
                      </Text>
                      {!hasCat && <Ionicons name="checkmark" size={18} color={accent} style={styles.categoryPickerCheck} />}
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
                          <Ionicons name={(cat.icon as any) || 'pricetag-outline'} size={18} color={isSelected ? accent : theme.colors.textSecondary} />
                          <Text style={[styles.categoryPickerItemText, isSelected && (isExpense ? styles.categoryChipTextActive : styles.categoryChipTextActiveIncome)]}>
                            {cat.name}
                          </Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color={accent} style={styles.categoryPickerCheck} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}
          </>
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
          keyboardShouldPersistTaps="handled"
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
          keyboardShouldPersistTaps="handled"
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

      {canEdit && activeTab === 'expenses' && !isMultiSelect && <View style={styles.fabContainer}>
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
      <Modal visible={showMerchantPicker} transparent animationType="slide" onRequestClose={() => setShowMerchantPicker(false)}>
        <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowMerchantPicker(false)}>
          <View style={styles.merchantModalSheet}>
            <View style={styles.merchantModalHeader}>
              <Text style={styles.merchantModalTitle}>{t('expenses.merchant')}</Text>
              <TouchableOpacity onPress={() => setShowMerchantPicker(false)}>
                <Text style={styles.merchantDone}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.merchantRow}
                onPress={() => setExpenseFilters({ merchants: [] })}
              >
                <Text style={styles.merchantRowText}>{t('expenses.merchantAll')}</Text>
                {expenseFilters.merchants.length === 0 && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
              {merchantList.map((m) => {
                const selected = expenseFilters.merchants.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={styles.merchantRow}
                    onPress={() => setExpenseFilters({
                      merchants: selected
                        ? expenseFilters.merchants.filter((x) => x !== m)
                        : [...expenseFilters.merchants, m],
                    })}
                  >
                    <Text style={styles.merchantRowText} numberOfLines={1}>{m}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
              {merchantList.length === 0 && (
                <Text style={styles.merchantEmpty}>{t('expenses.merchantNone')}</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk action bar */}
      {isMultiSelect && (
        <View style={styles.bulkActionBar}>
          {isBulkProcessing ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={() => { setShowBulkTagPicker(false); setShowBulkCategoryPicker(true); }}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="pricetag-outline" size={20} color={selectedIds.size > 0 ? theme.colors.primary : theme.colors.textDisabled} />
                <Text style={[styles.bulkActionText, selectedIds.size === 0 && styles.bulkActionTextDisabled]}>
                  {t('expenses.bulkSetCategory')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={() => { setShowBulkCategoryPicker(false); setShowBulkTagPicker(true); }}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="bookmark-outline" size={20} color={selectedIds.size > 0 ? theme.colors.accent : theme.colors.textDisabled} />
                <Text style={[styles.bulkActionText, selectedIds.size === 0 && styles.bulkActionTextDisabled]}>
                  {t('expenses.bulkAddTag')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bulkActionButton}
                onPress={handleBulkDelete}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="trash-outline" size={20} color={selectedIds.size > 0 ? theme.colors.danger : theme.colors.textDisabled} />
                <Text style={[styles.bulkActionText, { color: selectedIds.size > 0 ? theme.colors.danger : theme.colors.textDisabled }]}>
                  {t('expenses.bulkDelete')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Bulk Category Picker Modal */}
      <Modal visible={showBulkCategoryPicker} transparent animationType="slide" onRequestClose={() => setShowBulkCategoryPicker(false)}>
        <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowBulkCategoryPicker(false)}>
          <View style={styles.merchantModalSheet}>
            <View style={styles.merchantModalHeader}>
              <Text style={styles.merchantModalTitle}>{t('expenses.bulkSetCategory')}</Text>
              <TouchableOpacity onPress={() => setShowBulkCategoryPicker(false)}>
                <Text style={styles.merchantDone}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {categories.filter((c) => !c.isDeleted).map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.merchantRow}
                  onPress={() => handleBulkSetCategory(cat.id)}
                >
                  <Ionicons name={(cat.icon as any) || 'pricetag-outline'} size={18} color={theme.colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.merchantRowText}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
              {categories.filter((c) => !c.isDeleted).length === 0 && (
                <Text style={styles.merchantEmpty}>{t('expenses.categoryAll')}</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk Tag Picker Modal */}
      <Modal visible={showBulkTagPicker} transparent animationType="slide" onRequestClose={() => setShowBulkTagPicker(false)}>
        <TouchableOpacity style={styles.merchantModalOverlay} activeOpacity={1} onPress={() => setShowBulkTagPicker(false)}>
          <View style={styles.merchantModalSheet}>
            <BulkTagPickerSheet
              tags={allTags}
              onConfirm={handleBulkAddTags}
              onClose={() => setShowBulkTagPicker(false)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

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
  filterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    zIndex: 10,
  },
  filterPill: {
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'center' as const,
  },
  filterPillText: {
    flexShrink: 1,
  },
  filterTotal: {
    marginLeft: 'auto' as const,
    paddingLeft: theme.spacing[2],
    fontSize: 15,
    fontWeight: '700' as const,
    flexShrink: 0,
    color: theme.colors.textPrimary,
  },
  merchantModalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  merchantDone: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
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
  expenseMerchant: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
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
  merchantModalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' as const },
  merchantModalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[10],
  },
  merchantModalTitle: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary },
  merchantRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  merchantRowText: { fontSize: 15, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing[2] },
  merchantEmpty: { fontSize: 14, color: theme.colors.textTertiary, textAlign: 'center' as const, paddingVertical: theme.spacing[4] },
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
  checkboxContainer: {
    width: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  expenseCardSelected: {
    backgroundColor: theme.colors.primaryLight,
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
});

function BulkTagPickerSheet({ tags, onConfirm, onClose }: { tags: { id: string; name: string; isDeleted?: boolean }[]; onConfirm: (tagIds: string[]) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [pickedTagIds, setPickedTagIds] = useState<string[]>([]);
  const activeTags = tags.filter((tag) => !tag.isDeleted);
  return (
    <>
      <View style={styles.merchantModalHeader}>
        <Text style={styles.merchantModalTitle}>{t('expenses.bulkAddTag')}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.merchantDone}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {activeTags.map((tag) => {
          const picked = pickedTagIds.includes(tag.id);
          return (
            <TouchableOpacity
              key={tag.id}
              style={styles.merchantRow}
              onPress={() => setPickedTagIds((prev) => picked ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])}
            >
              <Ionicons name="bookmark-outline" size={18} color={picked ? theme.colors.accent : theme.colors.textSecondary} style={{ marginRight: 8 }} />
              <Text style={[styles.merchantRowText, picked && { color: theme.colors.accent }]}>{tag.name}</Text>
              {picked && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
            </TouchableOpacity>
          );
        })}
        {activeTags.length === 0 && (
          <Text style={styles.merchantEmpty}>{t('tags.noTags') || 'No tags yet'}</Text>
        )}
      </ScrollView>
      <TouchableOpacity
        style={[styles.addButton, { margin: 16, opacity: pickedTagIds.length === 0 ? 0.4 : 1 }]}
        disabled={pickedTagIds.length === 0}
        onPress={() => onConfirm(pickedTagIds)}
      >
        <Text style={styles.addButtonText}>{t('common.done')}</Text>
      </TouchableOpacity>
    </>
  );
}
