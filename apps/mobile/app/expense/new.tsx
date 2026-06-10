import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Switch,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { TagPicker } from '@/components/TagPicker';
import { ProjectPicker } from '@/components/ProjectPicker';
import { SplitEditor } from '@/components/SplitEditor';
import { insertSplit } from '@/db/splitRepository';
import { SUPPORTED_CURRENCIES, generateUUID } from '@budget/shared-utils';
import type { Currency, ExpenseCategorySplit, RecurringPeriod } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import { MerchantInput } from '@/components/MerchantInput';
import DateTimePicker from '@react-native-community/datetimepicker';

function getContrastTextColor(hexColor: string | undefined): string {
  if (!hexColor || typeof hexColor !== 'string') return '#ffffff';
  const hex = hexColor.replace('#', '');
  if (hex.length < 6) return '#ffffff';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

export default function NewExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const params = useLocalSearchParams<{
    amount?: string;
    description?: string;
    merchant?: string;
    categoryId?: string;
    currencyCode?: string;
    isDebt?: string;
    isDebtRepayment?: string;
    relatedDebtIncomeId?: string;
    debtContactName?: string;
  }>();

  const { addExpense } = useExpenseStore();
  const { user } = useAuthStore();
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const { loadTags } = useTagStore();
  const { loadProjects } = useProjectStore();

  const [amount, setAmount] = useState(params.amount || '');
  const [description, setDescription] = useState(params.description || '');
  const [merchant, setMerchant] = useState(params.merchant || '');
  const [selectedCategory, setSelectedCategory] = useState(params.categoryId || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [currencyCode, setCurrencyCode] = useState<Currency>(
    (params.currencyCode as Currency) || user?.currencyCode || 'USD',
  );
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [pendingSplits, setPendingSplits] = useState<{ categoryId: string; categoryName: string; amount: number; percentage: number; notes?: string }[]>([]);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  // Recurring state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState<RecurringPeriod>('monthly');

  // Debt state
  const isDebtRepayment = params.isDebtRepayment === 'true';
  const [isDebt, setIsDebt] = useState(params.isDebt === 'true');
  const [debtContactName, setDebtContactName] = useState(params.debtContactName || '');
  const [debtDueDate, setDebtDueDate] = useState<Date | null>(null);
  const [showDebtDatePicker, setShowDebtDatePicker] = useState(false);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    loadTags();
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    const numericAmount = parseAmount(amount);
    if (!numericAmount || numericAmount <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    if (!description.trim()) {
      showAlert(t('common.error'), t('validation.noDescription'));
      return;
    }

    setIsSubmitting(true);
    try {
      const splitsPayload = pendingSplits.length >= 2
        ? pendingSplits.map(s => ({
            categoryId: s.categoryId,
            amount: s.amount,
            percentage: s.percentage,
            notes: s.notes,
          }))
        : undefined;

      const newExpense = await addExpense({
        userId: user?.id || '',
        amount: numericAmount,
        currencyCode,
        description: description.trim(),
        merchant: merchant.trim() || undefined,
        categoryId: selectedCategory || undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        projectId: selectedProjectId || undefined,
        date: new Date(),
        source: 'manual',
        isRecurring,
        recurringId: isRecurring ? generateUUID() : undefined,
        recurringPeriod: isRecurring ? recurringPeriod : undefined,
        isDebt: isDebt && !isDebtRepayment,
        isDebtRepayment,
        debtContactName: (isDebt || isDebtRepayment) ? debtContactName.trim() || undefined : undefined,
        debtDueDate: isDebt && debtDueDate ? debtDueDate : undefined,
        relatedDebtIncomeId: isDebtRepayment ? params.relatedDebtIncomeId : undefined,
        splits: splitsPayload,
      });

      // Save category splits locally
      if (pendingSplits.length >= 2) {
        const now = new Date();
        for (const s of pendingSplits) {
          const split: ExpenseCategorySplit = {
            id: generateUUID(),
            expenseId: newExpense.id,
            categoryId: s.categoryId,
            amount: s.amount,
            percentage: s.percentage,
            notes: s.notes,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            syncVersion: 0,
          };
          await insertSplit(split);
        }
      }

      router.back();
    } catch {
      showAlert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.flex}
      >
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* Amount */}
          <View style={styles.amountContainer}>
            <TouchableOpacity
              style={styles.currencyButton}
              onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
            >
              <Text style={styles.currencyText}>
                {SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.symbol || '$'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder={t('expenseNew.amountPlaceholder')}
              placeholderTextColor={theme.colors.textDisabled}
              keyboardType="decimal-pad"
              autoFocus={!params.amount}
            />
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

          {/* Description */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('expenseNew.description')}</Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t('expenseNew.descriptionPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>

          {/* Merchant */}
          <View style={styles.fieldContainer}>
            <MerchantInput value={merchant} onChangeText={setMerchant} />
          </View>

          {/* Category */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('expenseNew.category')}</Text>
            <View style={styles.categoryGrid}>
              {getExpenseCategories().map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat.id && cat.color && {
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
                      selectedCategory === cat.id && {
                        color: getContrastTextColor(cat.color),
                        fontWeight: '600',
                      },
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

          {/* Tags */}
          <TagPicker
            selectedTagIds={selectedTagIds}
            onTagsChange={setSelectedTagIds}
            description={description}
          />

          {/* Project */}
          <ProjectPicker
            selectedProjectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
          />

          {/* Recurring Toggle */}
          {!isDebtRepayment && !isDebt && (
            <View style={styles.fieldContainer}>
              <View style={styles.debtToggleRow}>
                <View style={styles.debtToggleInfo}>
                  <Ionicons name="repeat-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.debtToggleLabel}>{t('recurring.repeat')}</Text>
                </View>
                <Switch value={isRecurring} onValueChange={setIsRecurring} />
              </View>
              {isRecurring && (
                <View style={[styles.debtFields, { flexDirection: 'row', gap: theme.spacing[2] }]}>
                  {(['weekly', 'monthly', 'yearly'] as RecurringPeriod[]).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.categoryChip,
                        { flex: 1 },
                        recurringPeriod === p && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                      ]}
                      onPress={() => setRecurringPeriod(p)}
                    >
                      <Text style={[styles.categoryChipText, recurringPeriod === p && { color: '#fff', fontWeight: '600' }]}>
                        {t(`recurring.${p}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Debt Toggle */}
          {isDebtRepayment ? (
            <View style={styles.debtBanner}>
              <Ionicons name="return-down-back" size={18} color={theme.colors.warning} />
              <Text style={styles.debtBannerText}>{t('debt.isDebtRepayment')}</Text>
              {params.debtContactName ? (
                <Text style={styles.debtBannerContact}>{params.debtContactName}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.fieldContainer}>
              <View style={styles.debtToggleRow}>
                <View style={styles.debtToggleInfo}>
                  <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.debtToggleLabel}>{t('debt.lendMoney')}</Text>
                </View>
                <Switch value={isDebt} onValueChange={setIsDebt} />
              </View>
              {isDebt && (
                <View style={styles.debtFields}>
                  <TextInput
                    style={styles.textInput}
                    placeholder={t('debt.contactNamePlaceholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    value={debtContactName}
                    onChangeText={setDebtContactName}
                  />
                  <TouchableOpacity
                    style={styles.debtDateButton}
                    onPress={() => {
                      if (debtDueDate) {
                        setDebtDueDate(null);
                        setShowDebtDatePicker(false);
                      } else {
                        setShowDebtDatePicker(true);
                      }
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.debtDateText}>
                      {debtDueDate
                        ? `${t('debt.dueDate')}: ${debtDueDate.toLocaleDateString()}`
                        : t('debt.setDueDate')}
                    </Text>
                    {debtDueDate && (
                      <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
                    )}
                  </TouchableOpacity>
                  {showDebtDatePicker && (
                    <DateTimePicker
                      value={debtDueDate || new Date(Date.now() + 30 * 86400000)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={new Date()}
                      onChange={(_event, selectedDate) => {
                        if (Platform.OS === 'android') setShowDebtDatePicker(false);
                        if (selectedDate) setDebtDueDate(selectedDate);
                      }}
                    />
                  )}
                </View>
              )}
            </View>
          )}

          {/* Category Split */}
          {showSplitEditor && parseAmount(amount) > 0 ? (
            <View style={styles.fieldContainer}>
              <SplitEditor
                totalAmount={parseAmount(amount) || 0}
                currencyCode={currencyCode}
                initialSplits={pendingSplits}
                onSplitsChange={(splits) => {
                  setPendingSplits(splits);
                  setShowSplitEditor(false);
                }}
                onCancel={() => setShowSplitEditor(false)}
              />
            </View>
          ) : pendingSplits.length >= 2 ? (
            <View style={styles.fieldContainer}>
              <View style={styles.splitHeader}>
                <Text style={styles.fieldLabel}>{t('splits.title')}</Text>
                <TouchableOpacity onPress={() => setPendingSplits([])}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
              {pendingSplits.map((s, i) => (
                <View key={i} style={styles.splitRow}>
                  <Text style={styles.splitName}>{s.categoryName}</Text>
                  <Text style={styles.splitAmount}>{currencyCode} {s.amount.toFixed(2)}</Text>
                  <Text style={styles.splitPercent}>{s.percentage.toFixed(0)}%</Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.splitEditBtn}
                onPress={() => setShowSplitEditor(true)}
              >
                <Text style={styles.splitEditText}>{t('common.edit')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.splitButton}
              onPress={() => setShowSplitEditor(true)}
            >
              <Ionicons name="git-branch-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.splitButtonText}>{t('splits.splitExpense')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Ionicons name="checkmark" size={22} color={theme.colors.textInverse} />
            <Text style={styles.submitButtonText}>
              {isSubmitting ? t('expenseNew.saving') : t('expenseNew.saveExpense')}
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
  amountContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: theme.spacing[8],
    paddingVertical: theme.spacing[4],
  },
  currencyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing[3],
    gap: theme.spacing[1],
  },
  currencyText: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    minWidth: 120,
    textAlign: 'center' as const,
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
  fieldContainer: {
    marginBottom: theme.spacing[6],
  },
  fieldLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  textInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
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
  // Splits
  splitButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    marginBottom: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
  },
  splitButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  splitHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  splitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
    gap: theme.spacing[2],
  },
  splitName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  splitAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  splitPercent: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    width: 36,
    textAlign: 'right' as const,
  },
  splitEditBtn: {
    alignSelf: 'flex-start' as const,
    paddingVertical: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  splitEditText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  // Debt styles
  debtBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.warningLight || theme.colors.surfaceSecondary,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[6],
  },
  debtBannerText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.warning,
  },
  debtBannerContact: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 'auto' as const,
  },
  debtToggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  debtToggleInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  debtToggleLabel: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  debtFields: {
    marginTop: theme.spacing[3],
    gap: theme.spacing[3],
  },
  debtDateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
  },
  debtDateText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.primary,
  },
});
