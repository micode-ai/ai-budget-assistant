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
  const [deadline, setDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDateHelper, setShowDateHelper] = useState(false);

  const quickDateOptions = [
    {
      label: t('goals.threeMonths') || '3 months',
      months: 3,
    },
    {
      label: t('goals.sixMonths') || '6 months',
      months: 6,
    },
    {
      label: t('goals.oneYear') || '1 year',
      months: 12,
    },
    {
      label: t('goals.twoYears') || '2 years',
      months: 24,
    },
  ];

  const setQuickDate = (months: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    const formatted = date.toISOString().split('T')[0];
    setDeadline(formatted);
    setShowDateHelper(false);
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

    if (!deadline) {
      Alert.alert(
        t('common.error'),
        t('goals.errorDeadline') || 'Please set a deadline',
      );
      return;
    }

    // Validate date format
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      Alert.alert(
        t('common.error'),
        t('goals.errorInvalidDate') || 'Please enter a valid date (YYYY-MM-DD)',
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
        deadline,
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
            <TextInput
              style={styles.textInput}
              value={deadline}
              onChangeText={setDeadline}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textTertiary}
              onFocus={() => setShowDateHelper(true)}
            />

            {showDateHelper && (
              <View style={styles.quickDateContainer}>
                <Text style={styles.quickDateLabel}>
                  {t('goals.quickSelect') || 'Quick select:'}
                </Text>
                <View style={styles.quickDateRow}>
                  {quickDateOptions.map((option) => (
                    <TouchableOpacity
                      key={option.months}
                      style={styles.quickDateChip}
                      onPress={() => setQuickDate(option.months)}
                    >
                      <Text style={styles.quickDateText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {deadline ? (
              <Text style={styles.datePreview}>
                <Ionicons name="calendar-outline" size={13} color={theme.colors.textTertiary} />
                {'  '}
                {new Date(deadline).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, (isSubmitting || !name.trim() || !targetAmount || !deadline) && styles.submitButtonDisabled]}
            onPress={handleCreate}
            disabled={isSubmitting || !name.trim() || !targetAmount || !deadline}
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

  // Quick date helpers
  quickDateContainer: {
    marginTop: theme.spacing[3],
  },
  quickDateLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  quickDateRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  quickDateChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  quickDateText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  datePreview: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
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
