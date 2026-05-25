import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import {
  BUDGET_PERIODS,
  SUPPORTED_CURRENCIES,
} from '@budget/shared-utils';
import type { Currency, BudgetPeriod } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import { BudgetCategoryEditor, type BudgetAllocationRow } from '@/components/BudgetCategoryEditor';

type BudgetMode = 'overall' | 'byCategory';

export default function NewBudgetScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { addBudget } = useBudgetStore();
  const { user } = useAuthStore();
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [currencyCode, setCurrencyCode] = useState<Currency>(user?.currencyCode || 'USD');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [alertThreshold, setAlertThreshold] = useState<number | null>(80);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('overall');
  const [categoryAllocations, setCategoryAllocations] = useState<BudgetAllocationRow[]>([]);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalFromAllocations = categoryAllocations.reduce((sum, a) => sum + a.amount, 0);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('budgetNew.errorName'));
      return;
    }

    const numericAmount = budgetMode === 'byCategory'
      ? totalFromAllocations
      : parseFloat(amount);

    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('budgetNew.errorAmount'));
      return;
    }

    if (budgetMode === 'byCategory' && categoryAllocations.length === 0) {
      Alert.alert(t('common.error'), t('budgetNew.errorNoCategories'));
      return;
    }

    setIsSubmitting(true);
    try {
      addBudget({
        userId: user?.id || '',
        name: name.trim(),
        amount: numericAmount,
        currencyCode,
        period,
        startDate: new Date(),
        categoryAllocations: budgetMode === 'byCategory'
          ? categoryAllocations.map((a) => ({
              id: '',
              budgetId: '',
              categoryId: a.categoryId,
              amount: a.amount,
              createdAt: new Date(),
              updatedAt: new Date(),
              isDeleted: false,
              syncVersion: 0,
            }))
          : selectedCategory
            ? [{
                id: '',
                budgetId: '',
                categoryId: selectedCategory,
                amount: numericAmount,
                createdAt: new Date(),
                updatedAt: new Date(),
                isDeleted: false,
                syncVersion: 0,
              }]
            : undefined,
        alertThreshold: alertThreshold,
        isActive: true,
      });

      router.back();
    } catch {
      Alert.alert(t('common.error'), t('budgetNew.errorFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const thresholdOptions: (number | null)[] = [null, 50, 75, 80, 90, 100];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.flex}
      >
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('budgetNew.name')}</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder={t('budgetNew.namePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
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
                {SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.symbol || '$'}{' '}
                {SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.code || 'USD'}
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
                    currencyCode === currency.code && styles.pickerItemSelected,
                  ]}
                  onPress={() => {
                    setCurrencyCode(currency.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={styles.pickerSymbol}>{currency.symbol}</Text>
                  <Text style={styles.pickerLabel}>{currency.name}</Text>
                  {currencyCode === currency.code && (
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
                style={[styles.modeButton, budgetMode === 'overall' && styles.modeButtonActive]}
                onPress={() => setBudgetMode('overall')}
              >
                <Text style={[styles.modeButtonText, budgetMode === 'overall' && styles.modeButtonTextActive]}>
                  {t('budgetNew.modeOverall')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, budgetMode === 'byCategory' && styles.modeButtonActive]}
                onPress={() => setBudgetMode('byCategory')}
              >
                <Text style={[styles.modeButtonText, budgetMode === 'byCategory' && styles.modeButtonTextActive]}>
                  {t('budgetNew.modeByCategory')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Overall mode: Amount + optional single category */}
          {budgetMode === 'overall' && (
            <>
              <View style={styles.fieldContainer}>
                <View style={styles.amountRow}>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
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
                        selectedCategory === cat.id && {
                          backgroundColor: cat.color,
                          borderColor: cat.color,
                        },
                      ]}
                      onPress={() =>
                        setSelectedCategory(selectedCategory === cat.id ? '' : cat.id)
                      }
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          styles.categoryChipText,
                          selectedCategory === cat.id && styles.categoryChipTextSelected,
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
                  setSelectedCategory(categoryId);
                  setShowCreateCategory(false);
                }}
              />
            </>
          )}

          {/* By Category mode: category allocations editor */}
          {budgetMode === 'byCategory' && (
            <View style={styles.fieldContainer}>
              <BudgetCategoryEditor
                currencyCode={currencyCode}
                allocations={categoryAllocations}
                onAllocationsChange={setCategoryAllocations}
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
                    period === p.value && styles.periodChipSelected,
                  ]}
                  onPress={() => setPeriod(p.value as BudgetPeriod)}
                >
                  <Text
                    style={[
                      styles.periodChipText,
                      period === p.value && styles.periodChipTextSelected,
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
                    alertThreshold === th && styles.thresholdChipSelected,
                  ]}
                  onPress={() => setAlertThreshold(th)}
                >
                  <Text
                    style={[
                      styles.thresholdChipText,
                      alertThreshold === th && styles.thresholdChipTextSelected,
                    ]}
                  >
                    {th === null ? t('budgetNew.noAlert') : `${th}%`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Ionicons name="checkmark" size={22} color={theme.colors.textInverse} />
            <Text style={styles.submitButtonText}>
              {isSubmitting ? t('budgetNew.creating') : t('budgetNew.createBudget')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing[6],
  },
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
  amountInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 20,
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
  submitButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[2],
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
});
