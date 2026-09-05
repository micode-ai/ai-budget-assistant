import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Animated } from 'react-native';
import type { TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { sumConverted } from '@/utils/total';
import { filterConsumption } from '@/utils/consumption';
import type { Expense, Income } from '@budget/shared-types';
import { useTagStore } from '@/stores/tagStore';
import { useExpenseMultiSelect } from '@/hooks/useExpenseMultiSelect';
import { buildExpenseMapPoints } from '@/components/map/buildMapPoints';

export type ActiveTab = 'expenses' | 'income';

/**
 * Owns all Zustand store subscriptions, derived data, effects and handlers
 * for the transactions screen (formerly `app/(tabs)/expenses.tsx`'s inline
 * body). Pure data/logic layer — no theme/JSX-producing render helpers
 * (those stay in `ExpensesMobile`, mirroring `useHomeScreenData.ts`'s split
 * of theme/UI-local concerns from the home screen's data hook). Extracted so
 * a desktop view can share the same filtering/derived-data logic instead of
 * duplicating it.
 */
export function useExpensesScreenData() {
  const { t } = useTranslation();
  const { tab, view, mapKey } = useLocalSearchParams<{ tab?: string; view?: string; mapKey?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
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
  const { points: mapPoints, missingCount } = useMemo(
    () => buildExpenseMapPoints(expenses),
    [expenses],
  );
  const rates = useExchangeRateStore((s) => s.rates);
  const baseCurrencyRaw = useExchangeRateStore((s) => s.baseCurrency);
  const userCurrency = useAuthStore((s) => s.user?.currencyCode);
  // Fall back to the user's display currency (not a hardcoded USD) when the
  // exchange-rate store hasn't populated its baseCurrency yet — e.g. a slow or
  // failed rate fetch. Otherwise a PLN account's total shows a "$" label.
  const baseCurrency = baseCurrencyRaw || userCurrency || 'USD';
  // filterConsumption applies only to this aggregate, never to `expenses`
  // itself — the split-receivable debt rows stay visible in the list (the
  // design spec keeps them shown, exactly like a manually-tracked debt), only
  // their contribution to this header total is wrong (the money already left
  // as the original receipt expense). See `src/utils/consumption.ts`.
  const filteredTotal = sumConverted(
    activeTab === 'expenses' ? filterConsumption(expenses) : incomes,
    baseCurrency,
    rates,
  );
  const allCategories = useCategoryStore((s) => s.categories);
  const categories = allCategories.filter(
    (c) => c.type === (activeTab === 'expenses' ? 'expense' : 'income') && !c.isDeleted
  );
  const merchantList = getDistinctMerchants();
  const allTags = useTagStore((s) => s.tags);
  const loadTags = useTagStore((s) => s.loadTags);
  const fabAnimation = useRef(new Animated.Value(0)).current;

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
    if (view === 'map') {
      setActiveTab('expenses');
      setViewMode('map');
    }
  }, [view, mapKey]);

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

  return {
    activeTab,
    setActiveTab,
    viewMode,
    setViewMode,
    searchVisible,
    setSearchVisible,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    refreshing,
    onRefresh,
    fabOpen,
    setFabOpen,
    fabAnimation,
    toggleFab,
    handleAddExpense,
    handleVoiceInput,
    handleScanReceipt,
    selectedTransaction,
    setSelectedTransaction,
    actionSheetVisible,
    setActionSheetVisible,
    handleLongPress,
    handleEdit,
    handleDuplicate,
    handleDeleteFromList,
    handleSearchChange,
    clearSearch,
    toggleSearch,
    switchTab,
    multiSelect,
    expenses,
    incomes,
    mapPoints,
    missingCount,
    rates,
    baseCurrency,
    filteredTotal,
    categories,
    merchantList,
    allTags,
    canEdit,
    currentAccountId,
    expenseFilters,
    setExpenseFilters,
    incomeFilters,
    setIncomeFilters,
    expensesLoading,
    incomesLoading,
  };
}

export type UseExpensesScreenDataReturn = ReturnType<typeof useExpensesScreenData>;
