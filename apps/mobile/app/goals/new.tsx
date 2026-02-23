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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useGoalStore } from '@/stores/goalStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Currency } from '@budget/shared-types';

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: 'USD', label: 'USD' },
  { code: 'EUR', label: 'EUR' },
  { code: 'PLN', label: 'PLN' },
  { code: 'GBP', label: 'GBP' },
  { code: 'UAH', label: 'UAH' },
  { code: 'RUB', label: 'RUB' },
  { code: 'BYN' as Currency, label: 'BYN' },
];

export default function NewGoalScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { createGoal } = useGoalStore();
  const currentAccount = useAccountStore((s) => s.currentAccount());

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState<string>(
    currentAccount?.currencyCode || 'USD',
  );
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deadlineString = deadlineDate ? deadlineDate.toISOString().split('T')[0] : '';

  const onDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selected) {
      setDeadlineDate(selected);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(
        t('common.error'),
        t('goals.errorName') || 'Please enter a goal name',
      );
      return;
    }

    const numericAmount = parseFloat(targetAmount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(
        t('common.error'),
        t('goals.errorAmount') || 'Please enter a valid target amount',
      );
      return;
    }

    if (!deadlineDate) {
      Alert.alert(
        t('common.error'),
        t('goals.errorDeadline') || 'Please set a deadline',
      );
      return;
    }

    if (deadlineDate <= new Date()) {
      Alert.alert(
        t('common.error'),
        t('goals.errorPastDate') || 'Deadline must be in the future',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await createGoal({
        name: name.trim(),
        targetAmount: numericAmount,
        currencyCode,
        deadline: deadlineString,
      });
      router.back();
    } catch {
      Alert.alert(
        t('common.error'),
        t('goals.errorCreate') || 'Failed to create goal. Please try again.',
      );
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
          {/* Goal Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {t('goals.goalName') || 'Goal Name'}
            </Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder={t('goals.goalNamePlaceholder') || 'e.g., New Car, Vacation, Emergency Fund'}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              maxLength={100}
            />
          </View>

          {/* Target Amount */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {t('goals.targetAmount') || 'Target Amount'}
            </Text>
            <TextInput
              style={styles.amountInput}
              value={targetAmount}
              onChangeText={setTargetAmount}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Currency */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {t('goals.currency') || 'Currency'}
            </Text>
            <View style={styles.currencyRow}>
              {CURRENCIES.map((cur) => (
                <TouchableOpacity
                  key={cur.code}
                  style={[
                    styles.currencyChip,
                    currencyCode === cur.code && styles.currencyChipSelected,
                  ]}
                  onPress={() => setCurrencyCode(cur.code)}
                >
                  <Text
                    style={[
                      styles.currencyChipText,
                      currencyCode === cur.code && styles.currencyChipTextSelected,
                    ]}
                  >
                    {cur.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Deadline */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {t('goals.deadline') || 'Deadline'}
            </Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={deadlineDate ? theme.colors.textPrimary : theme.colors.textTertiary} />
              <Text style={[styles.dateButtonText, !deadlineDate && styles.dateButtonPlaceholder]}>
                {deadlineDate
                  ? deadlineDate.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : t('goals.selectDate') || 'Select date'}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={deadlineDate || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={onDateChange}
              />
            )}

            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity
                style={styles.dateConfirmButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.dateConfirmText}>{t('common.done') || 'Done'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, (isSubmitting || !name.trim() || !targetAmount || !deadlineDate) && styles.submitButtonDisabled]}
            onPress={handleCreate}
            disabled={isSubmitting || !name.trim() || !targetAmount || !deadlineDate}
          >
            {isSubmitting ? (
              <Text style={styles.submitButtonText}>
                {t('common.loading') || 'Creating...'}
              </Text>
            ) : (
              <>
                <Ionicons name="flag" size={20} color={theme.colors.textInverse} />
                <Text style={styles.submitButtonText}>
                  {t('goals.createGoal') || 'Create Goal'}
                </Text>
              </>
            )}
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
  textInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  amountInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 24,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },

  // Currency chips
  currencyRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  currencyChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  currencyChipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500' as const,
  },
  currencyChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },

  // Date picker
  dateButton: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  dateButtonText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  dateButtonPlaceholder: {
    color: theme.colors.textTertiary,
  },
  dateConfirmButton: {
    marginTop: theme.spacing[3],
    alignSelf: 'flex-end' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  dateConfirmText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
  },

  // Footer
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
