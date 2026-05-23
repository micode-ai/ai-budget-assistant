import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { TimeRange } from '@/features/analytics/useAnalytics';
import type { Currency } from '@budget/shared-types';

interface Props {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  selectedCurrency: Currency | undefined;
  onCurrencyChange: (currency: Currency | undefined) => void;
  availableCurrencies: string[];
  selectedMonth: number;
  selectedYear: number;
  isCurrentPeriod: boolean;
  getPeriodLabel: () => string;
  goToPrevPeriod: () => void;
  goToNextPeriod: () => void;
}

export function AnalyticsHeader({
  selectedRange,
  onRangeChange,
  selectedCurrency,
  onCurrencyChange,
  availableCurrencies,
  isCurrentPeriod,
  getPeriodLabel,
  goToPrevPeriod,
  goToNextPeriod,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const TIME_RANGES: { key: TimeRange; label: string }[] = [
    { key: 'week', label: t('analytics.week') },
    { key: 'month', label: t('analytics.month') },
    { key: 'year', label: t('analytics.year') },
  ];

  return (
    <>
      {/* Time Range Selector */}
      <View style={styles.rangeSelector}>
        {TIME_RANGES.map((range) => (
          <TouchableOpacity
            key={range.key}
            style={[
              styles.rangeButton,
              selectedRange === range.key && styles.rangeButtonActive,
            ]}
            onPress={() => onRangeChange(range.key)}
          >
            <Text
              style={[
                styles.rangeButtonText,
                selectedRange === range.key && styles.rangeButtonTextActive,
              ]}
            >
              {range.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Month/Year Picker (hidden for 'week' range) */}
      {selectedRange !== 'week' && (
        <View style={styles.monthPickerRow}>
          <TouchableOpacity onPress={goToPrevPeriod} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthPickerLabel}>{getPeriodLabel()}</Text>
          <TouchableOpacity onPress={goToNextPeriod} hitSlop={8} disabled={isCurrentPeriod}>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Currency Filter */}
      {availableCurrencies.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyFilter}>
          <TouchableOpacity
            style={[styles.currencyChip, !selectedCurrency && styles.currencyChipActive]}
            onPress={() => onCurrencyChange(undefined)}
          >
            <Text style={[styles.currencyChipText, !selectedCurrency && styles.currencyChipTextActive]}>
              {t('analytics.allCurrencies')}
            </Text>
          </TouchableOpacity>
          {availableCurrencies.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.currencyChip, selectedCurrency === c && styles.currencyChipActive]}
              onPress={() => onCurrencyChange(c as Currency)}
            >
              <Text style={[styles.currencyChipText, selectedCurrency === c && styles.currencyChipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  rangeSelector: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  rangeButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  rangeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  rangeButtonText: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  rangeButtonTextActive: {
    color: theme.colors.textInverse,
  },
  monthPickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  monthPickerLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 140,
    textAlign: 'center' as const,
  },
  currencyFilter: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[4],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
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
});
