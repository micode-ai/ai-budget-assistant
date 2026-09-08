import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { TimeRange } from '@/features/analytics/useAnalytics';
import { CurrencyDropdown } from './CurrencyDropdown';

export interface ControlRowProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  selectedMonth: number;
  selectedYear: number;
  isCurrentPeriod: boolean;
  getPeriodLabel: () => string;
  goToPrevPeriod: () => void;
  goToNextPeriod: () => void;
  selectedCurrency: Currency | undefined;
  onCurrencyChange: (currency: Currency | undefined) => void;
  availableCurrencies: string[];
  onExport: () => void;
}

/**
 * Fixed row: segmented Week/Month/Year control (mirrors `ExpensesDesktop`'s
 * own List/Map view-toggle idiom, not mobile's full-width 3-button row) +
 * prev/next month arrows + a labelled currency dropdown (replacing mobile's
 * horizontal scrollable pill row — the exact "loudest phone tell" the
 * language doc calls out) + the Export button, promoted here from the bottom
 * of the mobile page.
 */
export function ControlRow({
  selectedRange,
  onRangeChange,
  selectedMonth,
  selectedYear,
  isCurrentPeriod,
  getPeriodLabel,
  goToPrevPeriod,
  goToNextPeriod,
  selectedCurrency,
  onCurrencyChange,
  availableCurrencies,
  onExport,
}: ControlRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const RANGES: { key: TimeRange; label: string }[] = [
    { key: 'week', label: t('analytics.week') },
    { key: 'month', label: t('analytics.month') },
    { key: 'year', label: t('analytics.year') },
  ];

  return (
    <View style={styles.controlRow}>
      <View style={styles.controlRowLeft}>
        <View style={styles.rangeToggle}>
          {RANGES.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => onRangeChange(r.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedRange === r.key }}
              style={[styles.rangeToggleButton, selectedRange === r.key && styles.rangeToggleButtonActive]}
            >
              <Text
                style={[styles.rangeToggleText, selectedRange === r.key && styles.rangeToggleTextActive]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedRange !== 'week' && (
          <View style={styles.periodNav}>
            <Pressable onPress={goToPrevPeriod} accessibilityRole="button" hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            </Pressable>
            <Text style={styles.periodNavLabel}>{getPeriodLabel()}</Text>
            <Pressable onPress={goToNextPeriod} accessibilityRole="button" hitSlop={8} disabled={isCurrentPeriod}>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
              />
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.controlRowRight}>
        {availableCurrencies.length > 1 && (
          <CurrencyDropdown
            selectedCurrency={selectedCurrency}
            onCurrencyChange={onCurrencyChange}
            availableCurrencies={availableCurrencies}
          />
        )}

        <Pressable style={styles.exportButton} onPress={onExport} accessibilityRole="button">
          <Ionicons name="download-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.exportButtonText}>{t('analytics.exportReport')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  controlRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  controlRowLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[4],
  },
  controlRowRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  rangeToggle: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  rangeToggleButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  rangeToggleButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  rangeToggleText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  rangeToggleTextActive: {
    color: theme.colors.primary,
  },
  periodNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  periodNavLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    minWidth: 120,
    textAlign: 'center' as const,
  },
  exportButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  exportButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
