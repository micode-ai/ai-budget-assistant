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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_EXPENSE_CATEGORIES, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export default function NewExpenseScreen() {
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
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    setIsSubmitting(true);
    try {
      addExpense({
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
      Alert.alert('Error', 'Failed to save expense');
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
              <Ionicons name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor="#ccc"
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
                    <Ionicons name="checkmark" size={20} color="#4ECDC4" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Description */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder="What was this expense for?"
              placeholderTextColor="#999"
            />
          </View>

          {/* Category */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Category</Text>
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
            <Ionicons name="checkmark" size={22} color="#fff" />
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : 'Save Expense'}
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
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    paddingVertical: 16,
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 12,
    gap: 4,
  },
  currencyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  amountInput: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 120,
    textAlign: 'center',
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
  textInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
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
