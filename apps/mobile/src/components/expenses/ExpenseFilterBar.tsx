import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme } from '@/theme';

type DateRange = 'week' | 'month' | 'year' | 'all' | 'custom';

interface ExpenseFilters {
  dateRange: DateRange;
  categoryId: string | null;
  merchants: string[];
  searchQuery: string;
  customMonth?: number;
  customYear?: number;
}

interface IncomeFilters {
  dateRange: DateRange;
  categoryId: string | null;
  searchQuery: string;
  customMonth?: number;
  customYear?: number;
}

export interface Category {
  id: string;
  name: string;
  icon?: string | null;
  type: string;
  isDeleted?: boolean;
}

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;
const DATE_RANGES: DateRange[] = ['week', 'month', 'year', 'all', 'custom'];

interface Props {
  activeTab: 'expenses' | 'income';
  expenseFilters: ExpenseFilters;
  setExpenseFilters: (update: Partial<ExpenseFilters>) => void;
  incomeFilters: IncomeFilters;
  setIncomeFilters: (update: Partial<IncomeFilters>) => void;
  categories: Category[];
  merchantList: string[];
  filteredTotal: number;
  baseCurrency: string;
}

export function ExpenseFilterBar({
  activeTab,
  expenseFilters,
  setExpenseFilters,
  incomeFilters,
  setIncomeFilters,
  categories,
  merchantList,
  filteredTotal,
  baseCurrency,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMerchantPicker, setShowMerchantPicker] = useState(false);

  // Close pickers when the active tab changes
  useEffect(() => {
    setShowCategoryPicker(false);
    setShowMerchantPicker(false);
  }, [activeTab]);

  const isExpense = activeTab === 'expenses';
  const currentFilters = isExpense ? expenseFilters : incomeFilters;
  const setCurrentFilters = isExpense
    ? (u: Partial<ExpenseFilters>) => setExpenseFilters(u)
    : (u: Partial<IncomeFilters>) => setIncomeFilters(u);
  const accent = isExpense ? theme.colors.primary : theme.colors.success;

  const selectedCategory = categories.find((c) => c.id === currentFilters.categoryId);
  const hasCat = currentFilters.categoryId !== null;
  const hasMerchants = expenseFilters.merchants.length > 0;

  const customMonth = currentFilters.customMonth ?? new Date().getMonth();
  const customYear = currentFilters.customYear ?? new Date().getFullYear();

  const goPrevMonth = () => {
    const prevMonth = customMonth === 0 ? 11 : customMonth - 1;
    const prevYear = customMonth === 0 ? customYear - 1 : customYear;
    setCurrentFilters({ customMonth: prevMonth, customYear: prevYear });
  };

  const goNextMonth = () => {
    const nextMonth = customMonth === 11 ? 0 : customMonth + 1;
    const nextYear = customMonth === 11 ? customYear + 1 : customYear;
    setCurrentFilters({ customMonth: nextMonth, customYear: nextYear });
  };

  return (
    <>
      {/* Period chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.periodScroll}
        contentContainerStyle={styles.periodRow}
      >
        {DATE_RANGES.map((range) => {
          const isActive = currentFilters.dateRange === range;
          return (
            <TouchableOpacity
              key={range}
              style={[
                styles.periodChip,
                { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.borderLight },
                isActive && { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
              ]}
              onPress={() => {
                const now = new Date();
                const update =
                  range === 'custom'
                    ? { dateRange: range, customMonth: now.getMonth(), customYear: now.getFullYear() }
                    : { dateRange: range };
                setCurrentFilters(update);
              }}
            >
              <Text
                style={[
                  styles.periodChipText,
                  { color: theme.colors.textTertiary },
                  isActive && { color: theme.colors.primary },
                ]}
              >
                {t(`expenses.period${range.charAt(0).toUpperCase()}${range.slice(1)}` as any)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Category + merchant pills + filtered total */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.pill,
            { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.borderLight },
            hasCat && isExpense && { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
            hasCat && !isExpense && {
              backgroundColor: theme.colors.success + '18',
              borderColor: theme.colors.success,
            },
          ]}
          onPress={() => setShowCategoryPicker((v) => !v)}
        >
          <Ionicons
            name={(selectedCategory?.icon as any) || 'pricetag-outline'}
            size={14}
            color={hasCat ? accent : theme.colors.textTertiary}
          />
          <Text
            style={[styles.pillText, { color: hasCat ? accent : theme.colors.textTertiary }]}
            numberOfLines={1}
          >
            {selectedCategory ? selectedCategory.name : t('expenses.categoryAll')}
          </Text>
          <Ionicons
            name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={hasCat ? accent : theme.colors.textTertiary}
          />
        </TouchableOpacity>

        {isExpense && (
          <TouchableOpacity
            style={[
              styles.pill,
              { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.borderLight },
              hasMerchants && { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
            ]}
            onPress={() => setShowMerchantPicker(true)}
          >
            <Ionicons
              name="storefront-outline"
              size={14}
              color={hasMerchants ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text
              style={[styles.pillText, { color: hasMerchants ? theme.colors.primary : theme.colors.textTertiary }]}
              numberOfLines={1}
            >
              {hasMerchants
                ? t('expenses.merchantsSelected', { count: expenseFilters.merchants.length })
                : t('expenses.merchantAll')}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={hasMerchants ? theme.colors.primary : theme.colors.textTertiary}
            />
          </TouchableOpacity>
        )}

        <Text style={[styles.filterTotal, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {formatCurrency(filteredTotal, baseCurrency)}
        </Text>
      </View>

      {/* Category dropdown (inline) */}
      {showCategoryPicker && (
        <View style={styles.categoryDropdownWrapper}>
          <View
            style={[
              styles.categoryDropdown,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                ...theme.shadows.md as any,
              },
            ]}
          >
            <ScrollView style={styles.categoryDropdownScroll} nestedScrollEnabled>
              <TouchableOpacity
                style={[
                  styles.categoryRow,
                  { borderBottomColor: theme.colors.borderLight },
                  !hasCat && { backgroundColor: theme.colors.surfaceSecondary },
                ]}
                onPress={() => {
                  setCurrentFilters({ categoryId: null });
                  setShowCategoryPicker(false);
                }}
              >
                <Ionicons
                  name="list-outline"
                  size={18}
                  color={!hasCat ? accent : theme.colors.textSecondary}
                />
                <Text style={[styles.categoryRowText, { color: !hasCat ? accent : theme.colors.textPrimary, flex: 1 }]}>
                  {t('expenses.categoryAll')}
                </Text>
                {!hasCat && <Ionicons name="checkmark" size={18} color={accent} />}
              </TouchableOpacity>

              {categories.map((cat) => {
                const isSelected = currentFilters.categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryRow,
                      { borderBottomColor: theme.colors.borderLight },
                      isSelected && { backgroundColor: theme.colors.surfaceSecondary },
                    ]}
                    onPress={() => {
                      setCurrentFilters({ categoryId: cat.id });
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Ionicons
                      name={(cat.icon as any) || 'pricetag-outline'}
                      size={18}
                      color={isSelected ? accent : theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.categoryRowText,
                        { color: isSelected ? accent : theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      {cat.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Month/Year Navigator (visible when dateRange === 'custom') */}
      {currentFilters.dateRange === 'custom' && (
        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={goPrevMonth}
            style={[styles.monthNavBtn, { backgroundColor: theme.colors.surfaceSecondary }]}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.monthNavLabel, { color: theme.colors.textPrimary }]}>
            {t(`analytics.months.${MONTH_KEYS[customMonth]}` as any)} {customYear}
          </Text>
          <TouchableOpacity
            onPress={goNextMonth}
            style={[styles.monthNavBtn, { backgroundColor: theme.colors.surfaceSecondary }]}
          >
            <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Merchant picker modal */}
      <Modal
        visible={showMerchantPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMerchantPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMerchantPicker(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                {t('expenses.merchant')}
              </Text>
              <TouchableOpacity onPress={() => setShowMerchantPicker(false)}>
                <Text style={[styles.modalAction, { color: theme.colors.primary }]}>
                  {t('common.done')}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <TouchableOpacity
                style={[styles.modalRow, { borderBottomColor: theme.colors.divider }]}
                onPress={() => setExpenseFilters({ merchants: [] })}
              >
                <Text style={[styles.modalRowText, { color: theme.colors.textPrimary }]}>
                  {t('expenses.merchantAll')}
                </Text>
                {expenseFilters.merchants.length === 0 && (
                  <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
              {merchantList.map((m) => {
                const selected = expenseFilters.merchants.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modalRow, { borderBottomColor: theme.colors.divider }]}
                    onPress={() =>
                      setExpenseFilters({
                        merchants: selected
                          ? expenseFilters.merchants.filter((x) => x !== m)
                          : [...expenseFilters.merchants, m],
                      })
                    }
                  >
                    <Text style={[styles.modalRowText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {m}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
              {merchantList.length === 0 && (
                <Text style={[styles.modalEmpty, { color: theme.colors.textTertiary }]}>
                  {t('expenses.merchantNone')}
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  periodScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  filterTotal: {
    marginLeft: 'auto',
    paddingLeft: 8,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 0,
  },
  categoryDropdownWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  categoryDropdown: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  categoryDropdownScroll: {
    maxHeight: 300,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  categoryRowText: {
    fontSize: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  monthNavBtn: {
    padding: 8,
    borderRadius: 12,
  },
  monthNavLabel: {
    fontSize: 15,
    fontWeight: '500',
    minWidth: 120,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalAction: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalScroll: {
    maxHeight: 360,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalRowText: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  modalEmpty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
