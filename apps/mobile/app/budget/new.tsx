import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';
import {
  BUDGET_PERIODS,
  SUPPORTED_CURRENCIES,
  DEFAULT_EXPENSE_CATEGORIES,
} from '@budget/shared-utils';
import type { Currency, BudgetPeriod } from '@budget/shared-types';

export default function NewBudgetScreen() {
  const { t } = useTranslation();
  const { addBudget } = useBudgetStore();
  const { user } = useAuthStore();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [currencyCode, setCurrencyCode] = useState<Currency>(user?.currencyCode || 'USD');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('budgetNew.errorName'));
      return;
    }

    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('budgetNew.errorAmount'));
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
        categoryId: selectedCategory || undefined,
        alertThreshold,
        isActive: true,
      });

      router.back();
    } catch (err) {
      Alert.alert(t('common.error'), t('budgetNew.errorFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const thresholdOptions = [50, 75, 80, 90, 100];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              placeholderTextColor="#999"
              autoFocus
            />
          </View>

          {/* Amount */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('budgetNew.amount')}</Text>
            <View style={styles.amountRow}>
              <TouchableOpacity
                style={styles.currencyButton}
                onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
              >
                <Text style={styles.currencyText}>
                  {SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.symbol || '$'}
                </Text>
                <Ionicons name="chevron-down" size={14} color="#666" />
              </TouchableOpacity>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder={t('budgetNew.amountPlaceholder')}
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
              />
            </View>
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
                    <Ionicons name="checkmark" size={20} color="#4ECDC4" />
                  )}
                </TouchableOpacity>
              ))}
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
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Category (optional) */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('budgetNew.categoryOptional')}</Text>
            <Text style={styles.fieldHint}>{t('budgetNew.categoryHint')}</Text>
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

          {/* Alert Threshold */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('budgetNew.alertAt')}</Text>
            <View style={styles.thresholdRow}>
              {thresholdOptions.map((th) => (
                <TouchableOpacity
                  key={th}
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
                    {th}%
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
            <Ionicons name="checkmark" size={22} color="#fff" />
            <Text style={styles.submitButtonText}>
              {isSubmitting ? t('budgetNew.creating') : t('budgetNew.createBudget')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 4,
  },
  currencyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  pickerItemSelected: {
    backgroundColor: '#E8F8F7',
  },
  pickerSymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    width: 30,
  },
  pickerLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  periodChipSelected: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  periodChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  periodChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  thresholdRow: {
    flexDirection: 'row',
    gap: 8,
  },
  thresholdChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  thresholdChipSelected: {
    backgroundColor: '#FFEAA7',
    borderColor: '#FFEAA7',
  },
  thresholdChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  thresholdChipTextSelected: {
    color: '#333',
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
