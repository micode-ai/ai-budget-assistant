import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { useExchangeRateWatchStore } from '@/stores/exchangeRateWatchStore';
import type { Currency, RateWatchDirection } from '@budget/shared-types';

interface RateAlertsSectionProps {
  fromCurrency: Currency;
  toCurrency: Currency;
  /** Current live rate (1 fromCurrency = currentRate toCurrency), when known — used only
   * to pick a sensible default direction for a newly-typed target. */
  currentRate?: number;
}

export function RateAlertsSection({ fromCurrency, toCurrency, currentRate }: RateAlertsSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { loadWatches, createWatch, deleteWatch, getWatchesForPair } = useExchangeRateWatchStore();

  const [expanded, setExpanded] = useState(false);
  const [targetRate, setTargetRate] = useState('');
  const [direction, setDirection] = useState<RateWatchDirection>('above');
  const [directionTouched, setDirectionTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pairWatches = getWatchesForPair(fromCurrency, toCurrency);

  const onTargetRateChange = (value: string) => {
    setTargetRate(value);
    if (directionTouched || !currentRate) return;
    const target = parseAmount(value);
    if (isFinite(target) && target > 0) {
      setDirection(target >= currentRate ? 'above' : 'below');
    }
  };

  const handleCreate = async () => {
    const target = parseAmount(targetRate);
    if (!isFinite(target) || target <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await createWatch({ fromCurrency, toCurrency, targetRate: target, direction });
      setTargetRate('');
      setDirectionTouched(false);
      setExpanded(false);
      showAlert(t('exchange.alertCreated'));
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('exchange.alertCreated'));
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

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{t('exchange.rateAlerts')}</Text>
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'add-circle-outline'}
            size={22}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      {pairWatches.length === 0 && !expanded && (
        <Text style={styles.emptyText}>{t('exchange.noAlerts')}</Text>
      )}

      {/* This card only ever shows the pair selected on this screen, so it has to
          point at the full list — otherwise an alert on another pair is
          unreachable (ABA-484). */}
      <TouchableOpacity
        style={styles.showAllRow}
        onPress={() => router.push('/wallet/rate-alerts')}
        accessibilityRole="button"
      >
        <Text style={styles.showAllText}>{t('common.showAll')}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
      </TouchableOpacity>

      {pairWatches.map((w) => (
        <View key={w.id} style={styles.watchRow}>
          <Text style={styles.watchText}>
            {t('exchange.alertWhen', {
              direction: t(w.direction === 'above' ? 'exchange.above' : 'exchange.below'),
              rate: w.targetRate,
              toCurrency,
            })}
          </Text>
          <TouchableOpacity onPress={() => confirmDelete(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}

      {expanded && (
        <View style={styles.form}>
          <Text style={styles.formLabel}>{t('exchange.notifyMe')}</Text>
          <View style={styles.rateInputRow}>
            <Text style={styles.rateLabel}>1 {fromCurrency} =</Text>
            <TextInput
              style={styles.rateInput}
              value={targetRate}
              onChangeText={onTargetRateChange}
              placeholder="0.0000"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
            />
            <Text style={styles.rateLabel}>{toCurrency}</Text>
          </View>
          <View style={styles.directionRow}>
            {(['above', 'below'] as RateWatchDirection[]).map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.directionChip, direction === d && styles.directionChipActive]}
                onPress={() => {
                  setDirection(d);
                  setDirectionTouched(true);
                }}
              >
                <Text style={[styles.directionChipText, direction === d && styles.directionChipTextActive]}>
                  {t(d === 'above' ? 'exchange.above' : 'exchange.below')}
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
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  showAllRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    paddingTop: theme.spacing[3],
  },
  showAllText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  watchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing[2],
  },
  watchText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  form: {
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  formLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  rateInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  rateLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  rateInput: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    textAlign: 'center' as const,
  },
  directionRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  directionChip: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  directionChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  directionChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  directionChipTextActive: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    alignItems: 'center' as const,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
  },
});
