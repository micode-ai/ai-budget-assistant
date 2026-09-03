import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
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
import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { TagPicker } from '@/components/TagPicker';
import { ProjectPicker } from '@/components/ProjectPicker';
import {
  TripExpenseSplitPicker,
  validateTripSplit,
  type TripExpenseShareValue,
} from '@/components/expenses/TripExpenseSplitPicker';
import { DebtExpenseFields } from '@/components/expenses/DebtExpenseFields';
import { RecurringExpenseFields } from '@/components/expenses/RecurringExpenseFields';
import { CategorySplitSection } from '@/components/expenses/CategorySplitSection';
import { useDebtExpenseFields } from '@/hooks/useDebtExpenseFields';
import { useRecurringExpenseFields } from '@/hooks/useRecurringExpenseFields';
import { useCategorySplitEditor } from '@/hooks/useCategorySplitEditor';
import { insertSplit } from '@/db/splitRepository';
import { SUPPORTED_CURRENCIES, generateUUID, formatDate } from '@budget/shared-utils';
import type { Currency, ExpenseCategorySplit, ShareType } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import { MerchantInput } from '@/components/MerchantInput';
import { DatePicker } from '@/components/DatePicker';
import { captureCurrentLocation, type CapturedLocation } from '@/services/locationCapture';

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
  const currentAccount = useAccountStore((s) => s.currentAccount());
  const accountMembersMap = useAccountStore((s) => s.members);
  const loadMembers = useAccountStore((s) => s.loadMembers);
  const { getExpenseCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const { loadTags } = useTagStore();
  const { loadProjects } = useProjectStore();

  const gpsLocationRef = useRef<CapturedLocation | null>(null);
  useEffect(() => {
    captureCurrentLocation().then((loc) => { gpsLocationRef.current = loc; });
  }, []);

  // Trip Expense Splitting (Group Trip Wallet): only relevant for `trip`
  // accounts — a complete no-op (no extra state used, no extra fields sent)
  // for every other account type.
  const isTripAccount = currentAccount?.type === 'trip';
  const tripMembers = isTripAccount && currentAccount
    ? (accountMembersMap[currentAccount.id] || []).map((m) => ({
        userId: m.userId,
        name: m.user?.name || m.user?.email || m.userId,
      }))
    : [];
  const [splitType, setSplitType] = useState<ShareType>('equal');
  const [shares, setShares] = useState<TripExpenseShareValue[]>([]);

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
  // Defaults to today, so the common case stays a zero-tap field; backdating an
  // expense you forgot to log no longer requires saving it and then editing the
  // date on the detail screen. Not clamped to the past — the edit-mode picker in
  // `ExpenseDetailsCard` accepts any date and the two must agree.
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  // Recurring, debt, and manual-category-split sub-forms are independently
  // evolving concerns extracted out of this screen's state (tech-debt
  // expense-new-screen-god-file) — each owns its own hook + presentational
  // component; handleSubmit below still reads their values directly.
  const recurring = useRecurringExpenseFields();

  const isDebtRepayment = params.isDebtRepayment === 'true';
  const debt = useDebtExpenseFields({
    isDebt: params.isDebt === 'true',
    debtContactName: params.debtContactName,
  });

  const categorySplit = useCategorySplitEditor();

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    loadTags();
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isTripAccount && currentAccount) {
      loadMembers(currentAccount.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, isTripAccount]);

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

    if (isTripAccount && !validateTripSplit(splitType, shares, numericAmount)) {
      showAlert(
        t('common.error'),
        splitType === 'exact'
          ? t('trip.splitExactMismatch', { amount: numericAmount.toFixed(2) })
          : t('trip.splitPercentageMismatch'),
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { pendingSplits } = categorySplit;
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
        date,
        source: 'manual',
        isRecurring: recurring.isRecurring,
        recurringId: recurring.isRecurring ? generateUUID() : undefined,
        recurringPeriod: recurring.isRecurring ? recurring.recurringPeriod : undefined,
        isDebt: debt.isDebt && !isDebtRepayment,
        isDebtRepayment,
        debtContactName: (debt.isDebt || isDebtRepayment) ? debt.debtContactName.trim() || undefined : undefined,
        debtDueDate: debt.isDebt && debt.debtDueDate ? debt.debtDueDate : undefined,
        relatedDebtIncomeId: isDebtRepayment ? params.relatedDebtIncomeId : undefined,
        splits: splitsPayload,
        ...(isTripAccount ? { splitType, shares } : {}),
        location: gpsLocationRef.current ?? undefined,
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

          {/* Trip Expense Split (Group Trip Wallet, trip accounts only).
              Gated on tripMembers.length > 0 (not just isTripAccount) —
              tripMembers comes from an async loadMembers() call, and
              TripExpenseSplitPicker seeds its selection from `members` only
              once at mount, so mounting it before members resolve would
              silently leave `shares` empty forever. Mirrors the same gate
              in ExpenseDetailsCard.tsx. */}
          {isTripAccount && tripMembers.length > 0 && (
            <TripExpenseSplitPicker
              members={tripMembers}
              totalAmount={parseAmount(amount) || 0}
              onChange={(nextSplitType, nextShares) => {
                setSplitType(nextSplitType);
                setShares(nextShares);
              }}
            />
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

          {/* Date — pre-filled with today; tap to backdate */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('expenseNew.date')}</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.dateButtonText}>
                {formatDate(date, undefined, getIntlLocale())}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DatePicker
                value={date}
                onChange={(selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) setDate(selectedDate);
                }}
              />
            )}
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
          {!isDebtRepayment && !debt.isDebt && (
            <RecurringExpenseFields {...recurring} />
          )}

          {/* Debt Toggle */}
          <DebtExpenseFields
            {...debt}
            isDebtRepayment={isDebtRepayment}
            repaymentContactName={params.debtContactName}
          />

          {/* Category Split */}
          <CategorySplitSection
            {...categorySplit}
            totalAmount={parseAmount(amount) || 0}
            currencyCode={currencyCode}
          />
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
  dateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
  },
  dateButtonText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
});
