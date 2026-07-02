import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

const DEFAULT_END_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

export default function NewTripScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { createTripAccount, isLoading } = useAccountStore();
  const { user } = useAuthStore();

  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState<Currency>(user?.currencyCode || 'USD');
  const [tripEndDate, setTripEndDate] = useState<Date>(DEFAULT_END_DATE);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selected) {
      setTripEndDate(selected);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showAlert(t('errors.error'), t('trip.nameRequired'));
      return;
    }

    try {
      const account = await createTripAccount(
        name.trim(),
        tripEndDate.toISOString().slice(0, 10),
        currencyCode,
      );
      router.replace(`/account/${account.id}`);
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Trip Name */}
        <Text style={styles.label}>{t('trip.tripName')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('trip.tripNamePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
        />

        {/* End Date */}
        <Text style={styles.label}>{t('trip.endDate')}</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.dateButtonText}>
            {tripEndDate.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={tripEndDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date()}
            onChange={onDateChange}
          />
        )}

        {Platform.OS === 'ios' && showDatePicker && (
          <TouchableOpacity style={styles.dateConfirmButton} onPress={() => setShowDatePicker(false)}>
            <Text style={styles.dateConfirmText}>{t('common.done')}</Text>
          </TouchableOpacity>
        )}

        {/* Currency */}
        <Text style={styles.label}>{t('trip.currency')}</Text>
        <View style={styles.currencyRow}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.currencyChip, currencyCode === c.code && styles.currencyChipActive]}
              onPress={() => setCurrencyCode(c.code)}
            >
              <Text style={[styles.currencyText, currencyCode === c.code && styles.currencyTextActive]}>
                {c.code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleCreate}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.submitButtonText}>{t('trip.createTrip')}</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
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
  currencyRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  currencyText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  currencyTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[8],
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
