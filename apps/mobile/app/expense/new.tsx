import { useState } from 'react';
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
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_EXPENSE_CATEGORIES, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function NewExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const params = useLocalSearchParams<{
    amount?: string;
    description?: string;
    categoryId?: string;
    currencyCode?: string;
  }>();

  const { addExpense } = useExpenseStore();
  const { user } = useAuthStore();

  const [amount, setAmount] = useState(params.amount || '');
  const [description, setDescription] = useState(params.description || '');
  const [selectedCategory, setSelectedCategory] = useState(params.categoryId || '');
  const [currencyCode, setCurrencyCode] = useState<Currency>(
    (params.currencyCode as Currency) || user?.currencyCode || 'USD',
  );
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      await addExpense({
        userId: user?.id || '',
        amount: numericAmount,
        currencyCode,
        description: description.trim(),
        categoryId: selectedCategory || undefined,
        date: new Date(),
        source: 'manual',
        isRecurring: false,
      });

      router.back();
    } catch (err) {
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

          {/* Category */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('expenseNew.category')}</Text>
            <View style={styles.categoryGrid}>
              {DEFAULT_EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat.name && {
                      backgroundColor: cat.color,
                      borderColor: cat.color,
                    },
                  ]}
                  onPress={() =>
                    setSelectedCategory(selectedCategory === cat.name ? '' : cat.name)
                  }
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat.name && styles.categoryChipTextSelected,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  categoryChipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
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
});
