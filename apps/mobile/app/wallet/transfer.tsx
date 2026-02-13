import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

export default function TransferScreen() {
  const { t } = useTranslation();
  const { addTransfer } = useWalletStore();
  const accounts = useAccountStore((s) => s.accounts);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [fromAccountId, setFromAccountId] = useState(currentAccountId || '');
  const [toAccountId, setToAccountId] = useState('');
  const [fromCurrency, setFromCurrency] = useState<Currency>('USD');
  const [toCurrency, setToCurrency] = useState<Currency>('USD');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [notes, setNotes] = useState('');
  const [loadingRate, setLoadingRate] = useState(false);

  // Set default currencies from selected accounts
  useEffect(() => {
    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    if (fromAccount) setFromCurrency(fromAccount.currencyCode as Currency);
  }, [fromAccountId]);

  useEffect(() => {
    const toAccount = accounts.find((a) => a.id === toAccountId);
    if (toAccount) setToCurrency(toAccount.currencyCode as Currency);
  }, [toAccountId]);

  // Fetch exchange rate when currencies differ
  useEffect(() => {
    if (fromCurrency === toCurrency) {
      setExchangeRate('1');
      if (fromAmount) setToAmount(fromAmount);
      return;
    }
    fetchRate();
  }, [fromCurrency, toCurrency]);

  const fetchRate = async () => {
    setLoadingRate(true);
    try {
      const data = await api.getExchangeRates(fromCurrency);
      const rate = data.rates[toCurrency];
      if (rate) {
        setExchangeRate(rate.toFixed(4));
        if (fromAmount) {
          setToAmount((parseFloat(fromAmount) * rate).toFixed(2));
        }
      }
    } catch (e) {
      console.log('Failed to fetch rate:', e);
    } finally {
      setLoadingRate(false);
    }
  };

  const onFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && exchangeRate) {
      setToAmount((parseFloat(value) * parseFloat(exchangeRate)).toFixed(2));
    } else {
      setToAmount('');
    }
  };

  const onToAmountChange = (value: string) => {
    setToAmount(value);
    if (value && exchangeRate) {
      setFromAmount((parseFloat(value) / parseFloat(exchangeRate)).toFixed(2));
    } else {
      setFromAmount('');
    }
  };

  const onRateChange = (value: string) => {
    setExchangeRate(value);
    if (fromAmount && value) {
      setToAmount((parseFloat(fromAmount) * parseFloat(value)).toFixed(2));
    }
  };

  const handleSubmit = () => {
    if (!fromAccountId || !toAccountId) {
      Alert.alert(t('common.error'), t('transfer.sameAccountError'));
      return;
    }
    if (fromAccountId === toAccountId) {
      Alert.alert(t('common.error'), t('transfer.sameAccountError'));
      return;
    }

    const from = parseFloat(fromAmount);
    const to = parseFloat(toAmount);
    const rate = parseFloat(exchangeRate);

    if (!from || !to || !rate || from <= 0 || to <= 0 || rate <= 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    addTransfer({
      fromAccountId,
      fromCurrency,
      fromAmount: from,
      toAccountId,
      toCurrency,
      toAmount: to,
      exchangeRate: rate,
      date: new Date(),
      notes: notes || undefined,
    });

    router.back();
  };

  const otherAccounts = accounts.filter((a) => a.id !== fromAccountId);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('transfer.title')}</Text>

        {/* From Account */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('transfer.fromAccount')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountPicker}>
            {accounts.filter((a) => a.myRole !== 'viewer').map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[styles.accountChip, fromAccountId === account.id && styles.accountChipActive]}
                onPress={() => setFromAccountId(account.id)}
              >
                <Text style={[styles.accountChipText, fromAccountId === account.id && styles.accountChipTextActive]}>
                  {account.name}
                </Text>
                <Text style={[styles.accountChipType, fromAccountId === account.id && styles.accountChipTextActive]}>
                  {account.currencyCode}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.label, { marginTop: theme.spacing[3] }]}>{t('wallet.currency')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, fromCurrency === c && styles.currencyChipActive]}
                onPress={() => setFromCurrency(c)}
              >
                <Text style={[styles.currencyChipText, fromCurrency === c && styles.currencyChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            style={styles.amountInput}
            value={fromAmount}
            onChangeText={onFromAmountChange}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.swapContainer}>
          <Ionicons name="arrow-down" size={24} color={theme.colors.primary} />
        </View>

        {/* To Account */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('transfer.toAccount')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountPicker}>
            {otherAccounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[styles.accountChip, toAccountId === account.id && styles.accountChipActive]}
                onPress={() => setToAccountId(account.id)}
              >
                <Text style={[styles.accountChipText, toAccountId === account.id && styles.accountChipTextActive]}>
                  {account.name}
                </Text>
                <Text style={[styles.accountChipType, toAccountId === account.id && styles.accountChipTextActive]}>
                  {account.currencyCode}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {fromCurrency !== toCurrency && (
            <>
              <Text style={[styles.label, { marginTop: theme.spacing[3] }]}>{t('wallet.currency')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.currencyChip, toCurrency === c && styles.currencyChipActive]}
                    onPress={() => setToCurrency(c)}
                  >
                    <Text style={[styles.currencyChipText, toCurrency === c && styles.currencyChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <TextInput
            style={styles.amountInput}
            value={toAmount}
            onChangeText={onToAmountChange}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Exchange Rate (only if currencies differ) */}
        {fromCurrency !== toCurrency && (
          <View style={styles.card}>
            <Text style={styles.label}>
              {t('transfer.rate')} {loadingRate ? '...' : ''}
            </Text>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>1 {fromCurrency} =</Text>
              <TextInput
                style={styles.rateInput}
                value={exchangeRate}
                onChangeText={onRateChange}
                placeholder="0.0000"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
              />
              <Text style={styles.rateLabel}>{toCurrency}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('transfer.notes')}</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('transfer.notesPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
          />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>{t('transfer.submit')}</Text>
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
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  title: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[6],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  accountPicker: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[3],
  },
  accountChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  accountChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  accountChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  accountChipType: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontSize: 10,
  },
  accountChipTextActive: {
    color: '#FFFFFF',
  },
  currencyPicker: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[3],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  currencyChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyChipTextActive: {
    color: '#FFFFFF',
  },
  amountInput: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
  },
  swapContainer: {
    alignSelf: 'center' as const,
    padding: theme.spacing[2],
    marginVertical: -theme.spacing[2],
    zIndex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
  },
  rateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  rateLabel: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
  },
  rateInput: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    textAlign: 'center' as const,
  },
  notesInput: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  submitButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: '#FFFFFF',
  },
});
