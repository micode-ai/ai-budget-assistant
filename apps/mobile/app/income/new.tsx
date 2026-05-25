import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTagStore } from '@/stores/tagStore';
import { TagPicker } from '@/components/TagPicker';
import { SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function NewIncomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const params = useLocalSearchParams<{
    isDebt?: string;
    isDebtRepayment?: string;
    relatedDebtExpenseId?: string;
    debtContactName?: string;
    currencyCode?: string;
    amount?: string;
    description?: string;
    categoryId?: string;
  }>();

  const { addIncome } = useIncomeStore();
  const { user } = useAuthStore();
  const { getIncomeCategories, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const { loadTags } = useTagStore();

  const isDebtRepayment = params.isDebtRepayment === 'true';
  const [amount, setAmount] = useState(params.amount || '');
  const [description, setDescription] = useState(params.description || '');
  const [notes, setNotes] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(params.categoryId || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [currencyCode, setCurrencyCode] = useState<Currency>(
    (params.currencyCode as Currency) || user?.currencyCode || 'USD',
  );
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  // Debt state
  const [isDebt, setIsDebt] = useState(params.isDebt === 'true');
  const [debtContactName, setDebtContactName] = useState(params.debtContactName || '');
  const [debtDueDate, setDebtDueDate] = useState<Date | null>(null);
  const [showDebtDatePicker, setShowDebtDatePicker] = useState(false);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    if (!description.trim()) {
      Alert.alert(t('common.error'), t('validation.noDescription'));
      return;
    }

    setIsSubmitting(true);
    try {
      await addIncome({
        userId: user?.id || '',
        amount: numericAmount,
        currencyCode,
        description: description.trim(),
        notes: notes.trim() || undefined,
        categoryId: selectedCategory || undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        date: new Date(),
        isDebt: isDebt && !isDebtRepayment,
        isDebtRepayment,
        debtContactName: (isDebt || isDebtRepayment) ? debtContactName.trim() || undefined : undefined,
        debtDueDate: isDebt && debtDueDate ? debtDueDate : undefined,
        relatedDebtExpenseId: isDebtRepayment ? params.relatedDebtExpenseId : undefined,
      });

      router.back();
    } catch {
      Alert.alert(t('common.error'), t('errors.saveFailed'));
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
              style={[styles.amountInput, { color: theme.colors.success }]}
              value={amount}
              onChangeText={setAmount}
              placeholder={t('incomeNew.amountPlaceholder')}
              placeholderTextColor={theme.colors.textDisabled}
              keyboardType="decimal-pad"
              autoFocus
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
            <Text style={styles.fieldLabel}>{t('incomeNew.description')}</Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t('incomeNew.descriptionPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>

          {/* Category */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('incomeNew.category')}</Text>
            <View style={styles.categoryGrid}>
              {getIncomeCategories().map((cat) => (
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
            type="income"
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
                  <Text style={styles.debtToggleLabel}>{t('debt.borrowMoney')}</Text>
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

          {/* Notes */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('incomeNew.notes')}</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('incomeNew.notesPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              multiline
            />
          </View>
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
              {isSubmitting ? t('incomeNew.saving') : t('incomeNew.saveIncome')}
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
    backgroundColor: theme.colors.success,
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
    color: theme.colors.textPrimary,
  },
});
