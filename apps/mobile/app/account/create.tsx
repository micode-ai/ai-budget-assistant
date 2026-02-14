import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountType, Currency } from '@budget/shared-types';

type IconName = keyof typeof Ionicons.glyphMap;

const ACCOUNT_TYPES: { type: AccountType; icon: IconName }[] = [
  { type: 'personal', icon: 'person-outline' },
  { type: 'business', icon: 'briefcase-outline' },
  { type: 'shared', icon: 'people-outline' },
  { type: 'investment', icon: 'trending-up-outline' },
];

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

export default function CreateAccountScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { createAccount, isLoading } = useAccountStore();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('personal');
  const [currencyCode, setCurrencyCode] = useState<Currency>('USD');

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(t('errors.error'), t('accounts.nameRequired'));
      return;
    }

    try {
      await createAccount({ name: name.trim(), type, currencyCode });
      router.back();
    } catch (e) {
      Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Account Name */}
        <Text style={styles.label}>{t('accounts.name')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('accounts.namePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
        />

        {/* Account Type */}
        <Text style={styles.label}>{t('accounts.type')}</Text>
        <View style={styles.typeRow}>
          {ACCOUNT_TYPES.map((item) => (
            <TouchableOpacity
              key={item.type}
              style={[
                styles.typeCard,
                type === item.type && styles.typeCardActive,
              ]}
              onPress={() => setType(item.type)}
            >
              <Ionicons
                name={item.icon}
                size={28}
                color={type === item.type ? theme.colors.primary : theme.colors.textTertiary}
              />
              <Text
                style={[
                  styles.typeLabel,
                  type === item.type && styles.typeLabelActive,
                ]}
              >
                {t(`accounts.types.${item.type}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Currency */}
        <Text style={styles.label}>{t('accounts.currency')}</Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.currencyChip,
                currencyCode === c && styles.currencyChipActive,
              ]}
              onPress={() => setCurrencyCode(c)}
            >
              <Text
                style={[
                  styles.currencyText,
                  currencyCode === c && styles.currencyTextActive,
                ]}
              >
                {c}
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
            <Text style={styles.submitButtonText}>{t('accounts.create')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  typeRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  typeCard: {
    width: '47%' as unknown as number,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
    gap: theme.spacing[1.5],
  },
  typeCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: theme.colors.textTertiary,
  },
  typeLabelActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
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
