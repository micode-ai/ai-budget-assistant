import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useExchangeRateWatchStore } from '@/stores/exchangeRateWatchStore';
import { partitionRateAlerts } from '@/features/wallet/rateAlerts';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { Currency, RateWatchDirection, ExchangeRateWatch } from '@budget/shared-types';
import { trackAction } from '@/services/telemetry';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

/**
 * Every rate alert the user has, across all pairs — the list the feature was
 * missing (ABA-484). `RateAlertsSection` on the exchange screen only ever shows
 * the pair selected there, so with up to 20 active alerts over 42 directed pairs
 * an alert you had forgotten the pair of was unreachable, and a fired one was
 * invisible in the app entirely.
 *
 * Deliberately NOT gated on `canEdit`: a rate target is personal, like the
 * display currency or the accent colour, and the server sets no ViewerBlockGuard
 * on `/rate-watches`.
 */
export default function RateAlertsScreen() {
  useEffect(() => {
    trackAction('rate_alert_create', 'started');
  }, []);
  /**
   * `started` is emitted once per MOUNT, and this screen never navigates away on
   * success — it clears the rate field and stays put, ready for the next alert.
   * Two alerts in one visit therefore reported 1 started against 2 completed,
   * which put per-flow completion over 100% and pinned `abandoned` (derived as
   * started - completed - failed) at 0. So `completed` is once per mount too.
   * `failed` is deliberately NOT deduplicated: the two validation branches above
   * fire it repeatedly and that repetition is a real error-rate signal.
   */
  const completedRef = useRef(false);

  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();

  const { watches, loadWatches, createWatch, deleteWatch, isLoading } =
    useExchangeRateWatchStore();

  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fromCurrency, setFromCurrency] = useState<Currency>('EUR');
  const [toCurrency, setToCurrency] = useState<Currency>('PLN');
  const [targetRate, setTargetRate] = useState('');
  const [direction, setDirection] = useState<RateWatchDirection>('above');

  useFocusEffect(
    useCallback(() => {
      loadWatches();
    }, [loadWatches]),
  );

  const { active, triggered } = useMemo(() => partitionRateAlerts(watches), [watches]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWatches();
    } finally {
      setRefreshing(false);
    }
  }, [loadWatches]);

  const handleCreate = async () => {
    if (fromCurrency === toCurrency) {
      trackAction('rate_alert_create', 'failed');
      showAlert(t('common.error'), t('exchange.sameCurrencyError'));
      return;
    }
    const target = parseAmount(targetRate);
    if (!isFinite(target) || target <= 0) {
      trackAction('rate_alert_create', 'failed');
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await createWatch({ fromCurrency, toCurrency, targetRate: target, direction });
      if (!completedRef.current) {
        completedRef.current = true;
        trackAction('rate_alert_create', 'completed');
      }
      setTargetRate('');
      showAlert(t('exchange.alertCreated'));
    } catch (e) {
      trackAction('rate_alert_create', 'failed');
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.somethingWrong'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: string) => {
    showAlert(t('exchange.deleteAlertConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteWatch(id) },
    ]);
  };

  const renderRow = (watch: ExchangeRateWatch, fired: boolean) => (
    <View key={watch.id} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>
          {t('exchange.alertWhen', {
            direction: t(watch.direction === 'above' ? 'exchange.above' : 'exchange.below'),
            rate: watch.targetRate,
            toCurrency: watch.toCurrency,
          })}
        </Text>
        <Text style={styles.rowPair}>
          1 {watch.fromCurrency} → {watch.toCurrency}
        </Text>
        {fired && watch.triggeredAt && (
          <Text style={styles.rowFired}>
            {t('exchange.alertFiredAt', {
              rate: String(watch.triggeredRate ?? watch.targetRate),
              date: new Date(watch.triggeredAt).toLocaleDateString(locale),
            })}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => confirmDelete(watch.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.delete')}
      >
        <Ionicons name="trash-outline" size={18} color={theme.colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );

  const currencyChips = (
    selected: Currency,
    onSelect: (currency: Currency) => void,
    label: string,
  ) => (
    <View style={styles.pickerBlock}>
      <Text style={styles.formLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {CURRENCIES.map((currency) => (
          <TouchableOpacity
            key={currency}
            style={[styles.chip, selected === currency && styles.chipActive]}
            onPress={() => onSelect(currency)}
          >
            <Text style={[styles.chipText, selected === currency && styles.chipTextActive]}>
              {currency}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('exchange.newAlert')}</Text>
          {currencyChips(fromCurrency, setFromCurrency, t('exchange.from'))}
          {currencyChips(toCurrency, setToCurrency, t('exchange.to'))}

          <Text style={styles.formLabel}>{t('exchange.targetRate')}</Text>
          <View style={styles.rateInputRow}>
            <Text style={styles.rateLabel}>1 {fromCurrency} =</Text>
            <TextInput
              style={styles.rateInput}
              value={targetRate}
              onChangeText={setTargetRate}
              placeholder="0.0000"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
            />
            <Text style={styles.rateLabel}>{toCurrency}</Text>
          </View>

          <View style={styles.directionRow}>
            {(['above', 'below'] as RateWatchDirection[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, direction === option && styles.chipActive]}
                onPress={() => setDirection(option)}
              >
                <Text style={[styles.chipText, direction === option && styles.chipTextActive]}>
                  {t(option === 'above' ? 'exchange.above' : 'exchange.below')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleCreate}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{t('exchange.addAlert')}</Text>
          </TouchableOpacity>
        </View>

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('exchange.alertsWaiting')}</Text>
            <View style={styles.card}>{active.map((watch) => renderRow(watch, false))}</View>
          </View>
        )}

        {triggered.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('exchange.alertsFired')}</Text>
            <View style={styles.card}>{triggered.map((watch) => renderRow(watch, true))}</View>
          </View>
        )}

        {!isLoading && active.length === 0 && triggered.length === 0 && (
          <Text style={styles.empty}>{t('exchange.noAlertsYet')}</Text>
        )}
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1 as const,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1 as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    ...theme.shadows.md,
  },
  cardTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  pickerBlock: {
    marginBottom: theme.spacing[3],
  },
  formLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  chipRow: {
    gap: theme.spacing[2],
    paddingRight: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.semiBold,
  },
  rateInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  rateLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  rateInput: {
    flex: 1 as const,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    textAlign: 'center' as const,
  },
  directionRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.semiBold,
  },
  section: {
    marginTop: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[3],
  },
  rowMain: {
    flex: 1 as const,
    paddingRight: theme.spacing[3],
  },
  rowTitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  rowPair: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  rowFired: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    marginTop: 2,
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[8],
  },
});
