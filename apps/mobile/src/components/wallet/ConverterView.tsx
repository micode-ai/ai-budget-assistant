import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { parseAmount } from '@/utils/amount';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

/**
 * The entire body of `app/converter.tsx`, moved here unchanged so a desktop
 * dialog and the route can share one definition — nothing under `src/` may
 * import from `app/`. Follows `SetBalanceView`.
 *
 * **It takes no props, and needed no substitutions at all**: unlike every
 * other view extracted for a dashboard dialog, this screen never touched
 * `router` — no params to read, nothing to navigate to on save, because there
 * is nothing to save. It is a calculator.
 *
 * It renders its own `converter.title` heading, which is why `ConverterDialog`
 * deliberately draws no title of its own (the `SetBalanceDialog` precedent) —
 * the route header shows that same string above it on the phone, so the
 * duplication already exists there and is not worth reproducing in a dialog
 * that has the choice.
 */
export function ConverterView() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [fromCurrency, setFromCurrency] = useState<Currency>('USD');
  const [toCurrency, setToCurrency] = useState<Currency>('UAH');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);

  useEffect(() => {
    fetchRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCurrency, toCurrency]);

  const fetchRate = async () => {
    setLoadingRate(true);
    try {
      const data = await api.getExchangeRates(fromCurrency);
      const r = data.rates[toCurrency];
      setRate(r ?? null);
    } catch {
      setRate(null);
    } finally {
      setLoadingRate(false);
    }
  };

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const parsedAmount = parseAmount(amount);
  const convertedAmount =
    isFinite(parsedAmount) && parsedAmount > 0 && rate != null && rate > 0
      ? (parsedAmount * rate).toFixed(2)
      : null;

  const availableFrom = CURRENCIES.filter((c) => c !== toCurrency);
  const availableTo = CURRENCIES.filter((c) => c !== fromCurrency);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('converter.title')}</Text>

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
            value={amount}
            onChangeText={setAmount}
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

          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>{t('converter.result')}</Text>
            <Text style={styles.resultValue}>
              {convertedAmount != null ? `${convertedAmount} ${toCurrency}` : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.rateInfoBox}>
          {loadingRate ? (
            <Text style={styles.rateInfoText}>...</Text>
          ) : rate != null ? (
            <Text style={styles.rateInfoText}>
              {t('converter.rateInfo', {
                from: fromCurrency,
                rate: rate.toFixed(4),
                to: toCurrency,
              })}
            </Text>
          ) : null}
        </View>
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
  resultBox: {
    marginTop: theme.spacing[3],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
  },
  resultLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  resultValue: {
    ...theme.textStyles.h1,
    color: theme.colors.primary,
    textAlign: 'center' as const,
  },
  rateInfoBox: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  rateInfoText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
});
