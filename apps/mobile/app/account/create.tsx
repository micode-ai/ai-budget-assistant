import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import type { AccountType, Currency } from '@budget/shared-types';

type IconName = keyof typeof Ionicons.glyphMap;

const ACCOUNT_TYPES: { type: AccountType; icon: IconName }[] = [
  { type: 'personal', icon: 'person-outline' },
  { type: 'business', icon: 'briefcase-outline' },
  { type: 'shared', icon: 'people-outline' },
];

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB'];

export default function CreateAccountScreen() {
  const { t } = useTranslation();
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
                color={type === item.type ? '#4ECDC4' : '#999'}
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('accounts.create')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  typeCardActive: {
    borderColor: '#4ECDC4',
    backgroundColor: '#f0faf9',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
  },
  typeLabelActive: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currencyChipActive: {
    borderColor: '#4ECDC4',
    backgroundColor: '#f0faf9',
  },
  currencyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  currencyTextActive: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
