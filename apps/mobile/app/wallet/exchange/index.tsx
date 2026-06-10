import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useState, useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/stores/walletStore';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

export default function ExchangeScreen() {
  const { t } = useTranslation();
  const { addExchange } = useWalletStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [fromCurrency, setFromCurrency] = useState<Currency>('USD');
  const [toCurrency, setToCurrency] = useState<Currency>('EUR');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingRate, setLoadingRate] = useState(false);

  useEffect(() => {
    if (fromCurrency !== toCurrency) {
      fetchRate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCurrency, toCurrency]);

  const fetchRate = async () => {
    setLoadingRate(true);
    try {
      const data = await api.getExchangeRates(fromCurrency);
      const rate = data.rates[toCurrency];
      if (rate) {
        setExchangeRate(rate.toFixed(4));
        if (fromAmount) {
          setToAmount((parseAmount(fromAmount) * rate).toFixed(2));
        }
      }
    } catch {
      // ignore — rate field stays empty
    } finally {
      setLoadingRate(false);
    }
  };

  const onFromAmountChange = (value: string) => {
    setFromAmount(value);
    const from = parseAmount(value);
    const rate = parseAmount(exchangeRate);
    if (isFinite(from) && isFinite(rate) && rate > 0) {
      setToAmount((from * rate).toFixed(2));
    } else {
      setToAmount('');
    }
  };

  const onToAmountChange = (value: string) => {
    setToAmount(value);
    const to = parseAmount(value);
    const rate = parseAmount(exchangeRate);
    if (isFinite(to) && isFinite(rate) && rate > 0) {
      setFromAmount((to / rate).toFixed(2));
    } else {
      setFromAmount('');
    }
  };

  const onRateChange = (value: string) => {
    setExchangeRate(value);
    const from = parseAmount(fromAmount);
    const rate = parseAmount(value);
    if (isFinite(from) && isFinite(rate) && rate > 0) {
      setToAmount((from * rate).toFixed(2));
    }
  };

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    if (exchangeRate && parseAmount(exchangeRate) > 0) {
      setExchangeRate((1 / parseAmount(exchangeRate)).toFixed(4));
    }
  };

  const handleSubmit = () => {
    if (fromCurrency === toCurrency) {
      showAlert(t('common.error'), t('exchange.sameCurrencyError'));
      return;
    }

    const from = parseAmount(fromAmount);
    const to = parseAmount(toAmount);
    const rate = parseAmount(exchangeRate);

    if (!from || !to || !rate || from <= 0 || to <= 0 || rate <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    addExchange({
      fromCurrency,
      toCurrency,
      fromAmount: from,
      toAmount: to,
      exchangeRate: rate,
      date: new Date(),
      notes: notes || undefined,
    });

    router.back();
  };

  const availableTo = CURRENCIES.filter((c) => c !== fromCurrency);
  const availableFrom = CURRENCIES.filter((c) => c !== toCurrency);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/wallet/exchanges')}
              accessibilityLabel={t('exchange.allExchanges')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="time-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>

        <View style={styles.card}>
          <Text style={styles.label}>{t('exchange.from')}</Text>
          <View style={styles.currencyRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
              {availableFrom.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyChip, fromCurrency === c && styles.currencyChipActive]}
                  onPress={() => setFromCurrency(c)}
                >
                  <Text style={[styles.currencyChipText, fromCurrency === c && styles.currencyChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <TextInput
            style={styles.amountInput}
            value={fromAmount}
            onChangeText={onFromAmountChange}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />

          <TouchableOpacity style={styles.swapButton} onPress={swapCurrencies}>
            <Ionicons name="swap-vertical" size={24} color={theme.colors.primary} />
          </TouchableOpacity>

          <Text style={styles.label}>{t('exchange.to')}</Text>
          <View style={styles.currencyRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
              {availableTo.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyChip, toCurrency === c && styles.currencyChipActive]}
                  onPress={() => setToCurrency(c)}
                >
                  <Text style={[styles.currencyChipText, toCurrency === c && styles.currencyChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <TextInput
            style={styles.amountInput}
            value={toAmount}
            onChangeText={onToAmountChange}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            {t('exchange.rate')} {loadingRate ? '...' : ''}
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

        <View style={styles.card}>
          <Text style={styles.label}>{t('exchange.notes')}</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('exchange.notesPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
          />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>{t('exchange.exchange')}</Text>
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
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
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
  currencyRow: {
    marginBottom: theme.spacing[3],
  },
  currencyPicker: {
    flexDirection: 'row' as const,
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
  swapButton: {
    alignSelf: 'center' as const,
    padding: theme.spacing[3],
    marginVertical: theme.spacing[2],
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
