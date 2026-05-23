import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { formatCurrency, BUDGET_PERIODS, SUPPORTED_CURRENCIES, getStartOfWeek } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { BudgetPeriod, Currency } from '@budget/shared-types';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import { BudgetCategoryEditor, type BudgetAllocationRow } from '@/components/BudgetCategoryEditor';

type BudgetMode = 'overall' | 'byCategory';

export default function BudgetDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { budgets, updateBudget, deleteBudget, getBudgetProgress, budgetHistory, loadBudgetHistory } = useBudgetStore();
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const budget = budgets.find((b) => b.id === id);

  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const progress = budget ? getBudgetProgress(budget.id, referenceDate) : null;
  const historyData = (budget && budgetHistory[budget.id]) || [];

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPeriod, setEditPeriod] = useState<BudgetPeriod>('monthly');
  const [editCurrencyCode, setEditCurrencyCode] = useState<Currency>('USD');
  const [editSelectedCategory, setEditSelectedCategory] = useState('');
  const [editAlertThreshold, setEditAlertThreshold] = useState<number | null>(80);
  const [editBudgetMode, setEditBudgetMode] = useState<BudgetMode>('overall');
  const [editCategoryAllocations, setEditCategoryAllocations] = useState<BudgetAllocationRow[]>([]);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (budget && budget.period !== 'custom') {
      loadBudgetHistory(budget.id, 6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.id]);

  // Reset to current period when the budget's period changes (e.g., user
  // edited monthly → weekly), otherwise referenceDate could sit in a period
  // that no longer makes sense for the new period type.
  useEffect(() => {
    setReferenceDate(new Date());
  }, [budget?.period]);

  if (!budget) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('budgetDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const periodsMatch = (period: string, a: Date, b: Date): boolean => {
    switch (period) {
      case 'daily':
        return a.toDateString() === b.toDateString();
      case 'weekly':
        return getStartOfWeek(a).getTime() === getStartOfWeek(b).getTime();
      case 'monthly':
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
      case 'yearly':
        return a.getFullYear() === b.getFullYear();
      default:
        return true;
    }
  };

  const isCurrentPeriod = budget ? periodsMatch(budget.period, referenceDate, new Date()) : true;

  const stepPeriod = (delta: 1 | -1) => {
    if (!budget) return;
    const d = new Date(referenceDate);
    switch (budget.period) {
      case 'daily':
        d.setDate(d.getDate() + delta);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7 * delta);
        // Re-align to week-start to avoid DST drift.
        setReferenceDate(getStartOfWeek(d));
        return;
      case 'monthly':
        d.setMonth(d.getMonth() + delta);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + delta);
        break;
      default:
        return; // 'custom' — no navigation
    }
    setReferenceDate(d);
  };

  const canGoBack = (() => {
    if (!budget || budget.period === 'custom') return false;
    let candidate = new Date(referenceDate);
    switch (budget.period) {
      case 'daily':
        candidate.setDate(candidate.getDate() - 1);
        break;
      case 'weekly':
        candidate.setDate(candidate.getDate() - 7);
        // Mirror stepPeriod's week-start alignment so the candidate
        // comparison is symmetric regardless of the initial referenceDate.
        candidate = getStartOfWeek(candidate);
        break;
      case 'monthly':
        candidate.setMonth(candidate.getMonth() - 1);
        break;
      case 'yearly':
        candidate.setFullYear(candidate.getFullYear() - 1);
        break;
    }
    const budgetStart = new Date(budget.startDate);
    return candidate >= budgetStart || periodsMatch(budget.period, candidate, budgetStart);
  })();

  const formatPeriodLabel = (): string => {
    if (!budget) return '';
    const locale = getIntlLocale();
    switch (budget.period) {
      case 'daily':
        return referenceDate.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
      case 'weekly': {
        const start = getStartOfWeek(referenceDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const from = start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        const to = end.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        return `${from} – ${to}`;
      }
      case 'monthly': {
        const name = referenceDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
      case 'yearly':
        return String(referenceDate.getFullYear());
      default:
        return '';
    }
  };

  const startEditing = () => {
    const categories = useCategoryStore.getState().categories;
    const hasAllocations = budget.categoryAllocations && budget.categoryAllocations.length > 0;

    setEditName(budget.name);
    setEditAmount(budget.amount.toString());
    setEditPeriod(budget.period as BudgetPeriod);
    setEditCurrencyCode(budget.currencyCode as Currency);
    setEditSelectedCategory('');
    setEditAlertThreshold(budget.alertThreshold ?? 80);
    setEditBudgetMode(hasAllocations ? 'byCategory' : 'overall');
    setEditCategoryAllocations(
      hasAllocations
        ? budget.categoryAllocations!.map((a) => {
            const cat = categories.find((c) => c.id === a.categoryId);
            return {
              categoryId: a.categoryId,
              categoryName: cat?.name || 'Unknown',
              categoryColor: cat?.color,
              amount: a.amount,
            };
          })
        : [],
    );
    setShowCurrencyPicker(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setShowCurrencyPicker(false);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) {
      Alert.alert(t('common.error'), t('budgetNew.errorName'));
      return;
    }

    const totalFromAllocations = editCategoryAllocations.reduce((sum, a) => sum + a.amount, 0);
    const numericAmount = editBudgetMode === 'byCategory' ? totalFromAllocations : parseFloat(editAmount);

    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('budgetNew.errorAmount'));
      return;
    }

    if (editBudgetMode === 'byCategory' && editCategoryAllocations.length === 0) {
      Alert.alert(t('common.error'), t('budgetNew.errorNoCategories'));
      return;
    }

    setIsSaving(true);

    const updates: any = {
      name: editName.trim(),
      amount: numericAmount,
      currencyCode: editCurrencyCode,
      period: editPeriod,
      alertThreshold: editAlertThreshold,
    };

    if (editBudgetMode === 'byCategory') {
      updates.categoryAllocations = editCategoryAllocations.map((a) => ({
        id: '',
        budgetId: budget.id,
        categoryId: a.categoryId,
        amount: a.amount,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        syncVersion: 0,
      }));
    } else if (editSelectedCategory) {
      updates.categoryAllocations = [{
        id: '',
        budgetId: budget.id,
        categoryId: editSelectedCategory,
        amount: numericAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        syncVersion: 0,
      }];
    } else {
      updates.categoryAllocations = [];
    }

    updateBudget(budget.id, updates);
    setIsSaving(false);
    setIsEditing(false);
  };

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
    ? theme.colors.danger
    : percentUsed > 80
      ? theme.colors.warning
      : theme.colors.primary;

  const thresholdOptions: (number | null)[] = [null, 50, 75, 80, 90, 100];

  // --- History chart data (computed outside JSX) ---
  const historyOverCount = historyData.filter((h) => h.isOverBudget).length;
  const historyTotal = historyData.length;
  const historyAvgOverage = historyOverCount > 0
    ? historyData.filter((h) => h.isOverBudget).reduce((s, h) => s + (h.actual - h.limit), 0) / historyOverCount
    : 0;
  const historySavings = historyData.filter((h) => !h.isOverBudget);
  const historyAvgSavings = historySavings.length > 0
    ? historySavings.reduce((s, h) => s + (h.limit - h.actual), 0) / historySavings.length
    : 0;
  const historyLocale = getIntlLocale();
  const historyShortLabel = (iso: string): string => {
    if (!budget) return '';
    const d = new Date(iso);
    switch (budget.period) {
      case 'daily': return d.toLocaleDateString(historyLocale, { month: 'numeric', day: 'numeric' });
      case 'weekly': return d.toLocaleDateString(historyLocale, { month: 'short', day: 'numeric' });
      case 'monthly': return d.toLocaleDateString(historyLocale, { month: 'short' });
      case 'yearly': return String(d.getFullYear());
      default: return '';
    }
  };
  const historyChartData = historyData.map((h) => ({
    label: historyShortLabel(h.periodStart),
    values: [
      { value: h.actual, color: h.isOverBudget ? theme.colors.danger : theme.colors.primary },
      { value: h.limit, color: theme.colors.textDisabled },
    ],
  }));

  // --- EDIT MODE ---
  if (isEditing) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView style={styles.flex} contentContainerStyle={styles.editScrollContent}>
            {/* Name */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('budgetNew.name')}</Text>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder={t('budgetNew.namePlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            {/* Currency */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('budgetNew.amount')}</Text>
              <TouchableOpacity
                style={styles.currencyButton}
                onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
              >
                <Text style={styles.currencyText}>
                  {SUPPORTED_CURRENCIES.find((c) => c.code === editCurrencyCode)?.symbol || '$'}{' '}
                  {SUPPORTED_CURRENCIES.find((c) => c.code === editCurrencyCode)?.code || 'USD'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {showCurrencyPicker && (
              <View style={styles.pickerContainer}>
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <TouchableOpacity
                    key={currency.code}
                    style={[
                      styles.pickerItem,
                      editCurrencyCode === currency.code && styles.pickerItemSelected,
                    ]}
                    onPress={() => {
                      setEditCurrencyCode(currency.code);
                      setShowCurrencyPicker(false);
                    }}
                  >
                    <Text style={styles.pickerSymbol}>{currency.symbol}</Text>
                    <Text style={styles.pickerLabel}>{currency.name}</Text>
                    {editCurrencyCode === currency.code && (
                      <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Budget Mode Toggle */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('budgetNew.budgetMode')}</Text>
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeButton, editBudgetMode === 'overall' && styles.modeButtonActive]}
                  onPress={() => setEditBudgetMode('overall')}
                >
                  <Text style={[styles.modeButtonText, editBudgetMode === 'overall' && styles.modeButtonTextActive]}>
                    {t('budgetNew.modeOverall')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, editBudgetMode === 'byCategory' && styles.modeButtonActive]}
                  onPress={() => setEditBudgetMode('byCategory')}
                >
                  <Text style={[styles.modeButtonText, editBudgetMode === 'byCategory' && styles.modeButtonTextActive]}>
                    {t('budgetNew.modeByCategory')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Overall mode: Amount + optional single category */}
            {editBudgetMode === 'overall' && (
              <>
                <View style={styles.fieldContainer}>
                  <View style={styles.amountRow}>
                    <TextInput
                      style={styles.amountInput}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      placeholder={t('budgetNew.amountPlaceholder')}
                      placeholderTextColor={theme.colors.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                {/* Category (optional) */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>{t('budgetNew.categoryOptional')}</Text>
                  <Text style={styles.fieldHint}>{t('budgetNew.categoryHint')}</Text>
                  <View style={styles.categoryGrid}>
                    {getExpenseCategories().map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryChip,
                          editSelectedCategory === cat.id && {
                            backgroundColor: cat.color,
                            borderColor: cat.color,
                          },
                        ]}
                        onPress={() =>
                          setEditSelectedCategory(editSelectedCategory === cat.id ? '' : cat.id)
                        }
                      >
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[
                            styles.categoryChipText,
                            editSelectedCategory === cat.id && styles.categoryChipTextSelected,
                          ]}
                        >
                          {getCategoryDisplayName(cat, t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.categoryChip, styles.addCategoryChip]}
                      onPress={() => setShowCreateCategory(true)}
                    >
                      <Ionicons name="add" size={16} color={theme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <CreateCategoryModal
                  visible={showCreateCategory}
                  type="expense"
                  onClose={() => setShowCreateCategory(false)}
                  onCreated={(categoryId) => {
                    setEditSelectedCategory(categoryId);
                    setShowCreateCategory(false);
                  }}
                />
              </>
            )}

            {/* By Category mode: category allocations editor */}
            {editBudgetMode === 'byCategory' && (
              <View style={styles.fieldContainer}>
                <BudgetCategoryEditor
                  currencyCode={editCurrencyCode}
                  allocations={editCategoryAllocations}
                  onAllocationsChange={setEditCategoryAllocations}
                />
              </View>
            )}

            {/* Period */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('budgetNew.period')}</Text>
              <View style={styles.periodRow}>
                {BUDGET_PERIODS.filter((p) => p.value !== 'custom').map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.periodChip,
                      editPeriod === p.value && styles.periodChipSelected,
                    ]}
                    onPress={() => setEditPeriod(p.value as BudgetPeriod)}
                  >
                    <Text
                      style={[
                        styles.periodChipText,
                        editPeriod === p.value && styles.periodChipTextSelected,
                      ]}
                    >
                      {t(`budgets.periods.${p.value}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Alert Threshold */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('budgetNew.alertAt')}</Text>
              <View style={styles.thresholdRow}>
                {thresholdOptions.map((th) => (
                  <TouchableOpacity
                    key={th ?? 'none'}
                    style={[
                      styles.thresholdChip,
                      editAlertThreshold === th && styles.thresholdChipSelected,
                    ]}
                    onPress={() => setEditAlertThreshold(th)}
                  >
                    <Text
                      style={[
                        styles.thresholdChipText,
                        editAlertThreshold === th && styles.thresholdChipTextSelected,
                      ]}
                    >
                      {th === null ? t('budgetNew.noAlert') : `${th}%`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Edit Actions Footer */}
          <View style={styles.footer}>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelEditButton} onPress={cancelEditing}>
                <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveEditButton, isSaving && styles.submitButtonDisabled]}
                onPress={handleSaveEdit}
                disabled={isSaving}
              >
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.saveEditText}>
                  {isSaving ? t('budgetDetail.saving') : t('budgetDetail.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- VIEW MODE ---
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

        {budget.period !== 'custom' && (
          <View style={styles.periodNavRow}>
            <TouchableOpacity
              onPress={() => stepPeriod(-1)}
              disabled={!canGoBack}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={canGoBack ? theme.colors.primary : theme.colors.textDisabled}
              />
            </TouchableOpacity>
            <Text style={styles.periodNavLabel}>{formatPeriodLabel()}</Text>
            <TouchableOpacity
              onPress={() => stepPeriod(1)}
              disabled={isCurrentPeriod}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressAmountRow}>
            <Text style={styles.spentAmount}>
              {formatCurrency(progress?.spent || 0, budget.currencyCode)}
            </Text>
            <Text style={styles.totalAmount}>
              {t('common.of')} {formatCurrency(budget.amount, budget.currencyCode)}
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
              {formatCurrency(progress.remaining, budget.currencyCode)} {t('budgets.remaining')}
            </Text>
          )}
        </View>

        {/* Category Breakdown Card */}
        {progress?.categoryBreakdown && progress.categoryBreakdown.length > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>{t('budgetDetail.categoryBreakdown')}</Text>
            {progress.categoryBreakdown.map((cat) => {
              const catPercentUsed = cat.percentageUsed;
              const catColor = cat.isOverBudget
                ? theme.colors.danger
                : catPercentUsed > 80
                  ? theme.colors.warning
                  : cat.categoryColor || theme.colors.primary;

              return (
                <View key={cat.categoryId} style={styles.breakdownRow}>
                  <View style={styles.breakdownHeader}>
                    <View style={[styles.catColorDot, { backgroundColor: cat.categoryColor || '#6B7280' }]} />
                    <Text style={styles.breakdownCatName} numberOfLines={1}>{cat.categoryName}</Text>
                    <Text style={styles.breakdownCatAmount}>
                      {formatCurrency(cat.spent, budget.currencyCode)} / {formatCurrency(cat.allocated, budget.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.breakdownProgressBar}>
                    <View
                      style={[
                        styles.breakdownProgressFill,
                        {
                          width: `${Math.min(catPercentUsed, 100)}%`,
                          backgroundColor: catColor,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.period')}</Text>
            <Text style={styles.detailValue}>
              {t(`budgets.periods.${budget.period}`)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.alertThreshold')}</Text>
            <Text style={styles.detailValue}>{budget.alertThreshold}%</Text>
          </View>

          {progress && (
            <>
              {isCurrentPeriod && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('budgetDetail.daysRemaining')}</Text>
                  <Text style={styles.detailValue}>{progress.daysRemaining}</Text>
                </View>
              )}

              {isCurrentPeriod && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('budgetDetail.projectedTotal')}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      progress.projectedTotal > budget.amount && { color: theme.colors.danger },
                    ]}
                  >
                    {formatCurrency(progress.projectedTotal, budget.currencyCode)}
                  </Text>
                </View>
              )}
            </>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('budgetDetail.status')}</Text>
            <Text style={[styles.detailValue, { color: budget.isActive ? theme.colors.primary : theme.colors.textTertiary }]}>
              {budget.isActive ? t('budgetDetail.active') : t('budgetDetail.inactive')}
            </Text>
          </View>
        </View>

        {/* History Card */}
        {budget.period !== 'custom' && historyChartData.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.historyTitle}>{t('budgetDetail.history.title')}</Text>
            <Text style={styles.historySummary}>
              {historyOverCount > 0
                ? t('budgetDetail.history.overCount', { count: historyOverCount, total: historyTotal })
                : t('budgetDetail.history.avgSavings', { amount: formatCurrency(historyAvgSavings, budget.currencyCode) })}
            </Text>
            {historyOverCount > 0 && (
              <Text style={styles.historySubSummary}>
                {t('budgetDetail.history.avgOverage', { amount: formatCurrency(historyAvgOverage, budget.currencyCode) })}
              </Text>
            )}
            <GroupedBarChart
              data={historyChartData}
              height={140}
              showLabels
              legendItems={[
                { label: t('budgetDetail.history.spent'), color: theme.colors.primary },
                { label: t('budgetDetail.history.limit'), color: theme.colors.textDisabled },
              ]}
            />
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.editButton} onPress={startEditing}>
              <Ionicons name="pencil" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash" size={22} color={theme.colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  notFoundText: {
    fontSize: 18,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[4],
  },
  backButton: {
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  backButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scrollContent: {
    padding: theme.spacing[4],
  },
  editScrollContent: {
    padding: theme.spacing[6],
  },
  headerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  budgetName: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    flex: 1,
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
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  statusTextOver: {
    color: theme.colors.danger,
  },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[6],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  progressAmountRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  spentAmount: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
  totalAmount: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },
  progressBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  progressBar: {
    flex: 1,
    height: 10,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 5,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 5,
  },
  percentText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    width: 45,
    textAlign: 'right' as const,
  },
  remainingText: {
    fontSize: 15,
    color: theme.colors.primary,
    marginTop: theme.spacing[3],
    fontWeight: '500' as const,
  },
  breakdownCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  breakdownRow: {
    marginBottom: theme.spacing[4],
  },
  breakdownHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  catColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownCatName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
  },
  breakdownCatAmount: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  breakdownProgressBar: {
    height: 6,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  breakdownProgressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  actionsContainer: {
    marginTop: theme.spacing[2],
  },
  editActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.danger,
  },
  // Edit mode styles
  fieldContainer: {
    marginBottom: theme.spacing[6],
  },
  fieldLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  fieldHint: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  textInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  amountInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 20,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  currencyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[1],
    alignSelf: 'flex-start' as const,
  },
  currencyText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  pickerContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[6],
    overflow: 'hidden' as const,
  },
  pickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pickerItemSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  pickerSymbol: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    width: 30,
  },
  pickerLabel: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  modeToggle: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
  },
  modeButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textSecondary,
  },
  modeButtonTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  periodRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  periodChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  periodChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  periodChipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500' as const,
  },
  periodChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  categoryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  categoryChip: {
    width: '31%' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  addCategoryChip: {
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  categoryChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  categoryChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  thresholdRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  thresholdChip: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  thresholdChipSelected: {
    backgroundColor: theme.colors.warning,
    borderColor: theme.colors.warning,
  },
  thresholdChipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500' as const,
  },
  thresholdChipTextSelected: {
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  footer: {
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  cancelEditButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cancelEditText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  saveEditButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  saveEditText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  periodNavRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  periodNavLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 160,
    textAlign: 'center' as const,
  },
  historyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  historySummary: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  historySubSummary: {
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing[4],
  },
});
