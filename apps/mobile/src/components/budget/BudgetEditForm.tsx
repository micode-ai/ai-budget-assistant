import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { BUDGET_PERIODS, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import type { BudgetPeriod, Currency, Budget } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import { BudgetCategoryEditor, type BudgetAllocationRow } from '@/components/BudgetCategoryEditor';

type BudgetMode = 'overall' | 'byCategory';

interface BudgetEditFormProps {
  budget: Budget;
  onSaved: () => void;
  onCancel: () => void;
}

export function BudgetEditForm({ budget, onSaved, onCancel }: BudgetEditFormProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { updateBudget } = useBudgetStore();
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.id]);

  const handleSave = () => {
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
    onSaved();
  };

  const thresholdOptions: (number | null)[] = [null, 50, 75, 80, 90, 100];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
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

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
              <Text style={styles.saveText}>
                {isSaving ? t('budgetDetail.saving') : t('budgetDetail.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
});
