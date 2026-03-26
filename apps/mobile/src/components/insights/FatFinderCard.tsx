import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInsightsStore } from '@/stores/insightsStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Currency } from '@budget/shared-types';

const SEVERITY_COLORS = (theme: Theme) => ({
  low: theme.colors.info,
  medium: theme.colors.warning,
  high: theme.colors.danger,
});

function getMonthLabel(month: number, year: number, locale: string): string {
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString(locale, { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
}

export function FatFinderCard() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();

  const fatFinderReport = useInsightsStore((s) => s.fatFinderReport);
  const fatFinderLoading = useInsightsStore((s) => s.fatFinderLoading);
  const fatFinderError = useInsightsStore((s) => s.fatFinderError);
  const loadFatFinder = useInsightsStore((s) => s.loadFatFinder);
  const fatFinderMonth = useInsightsStore((s) => s.fatFinderMonth);
  const fatFinderYear = useInsightsStore((s) => s.fatFinderYear);
  useEffect(() => {
    if (!fatFinderReport && !fatFinderLoading) {
      loadFatFinder(i18n.language, false, fatFinderMonth, fatFinderYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const isCurrentMonth = fatFinderMonth === now.getMonth() + 1 && fatFinderYear === now.getFullYear();

  const goToPrevMonth = useCallback(() => {
    let newMonth = fatFinderMonth - 1;
    let newYear = fatFinderYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    loadFatFinder(i18n.language, false, newMonth, newYear);
  }, [fatFinderMonth, fatFinderYear, i18n.language, loadFatFinder]);

  const goToNextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    let newMonth = fatFinderMonth + 1;
    let newYear = fatFinderYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    loadFatFinder(i18n.language, false, newMonth, newYear);
  }, [fatFinderMonth, fatFinderYear, isCurrentMonth, i18n.language, loadFatFinder]);

  const severityColors = SEVERITY_COLORS(theme);
  const currency = (fatFinderReport?.currencyCode || user?.currencyCode || 'USD') as Currency;
  const intlLocale = getIntlLocale();

  const monthPicker = (
    <View style={styles.monthPickerRow}>
      <TouchableOpacity onPress={goToPrevMonth} hitSlop={8} disabled={fatFinderLoading}>
        <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
      </TouchableOpacity>
      <Text style={styles.monthPickerLabel}>
        {getMonthLabel(fatFinderMonth, fatFinderYear, intlLocale)}
      </Text>
      <TouchableOpacity onPress={goToNextMonth} hitSlop={8} disabled={isCurrentMonth || fatFinderLoading}>
        <Ionicons
          name="chevron-forward"
          size={22}
          color={isCurrentMonth ? theme.colors.textDisabled : theme.colors.primary}
        />
      </TouchableOpacity>
    </View>
  );

  // Loading
  if (fatFinderLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="search-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.cardTitle}>{t('fatFinder.title')}</Text>
        </View>
        {monthPicker}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('fatFinder.loading')}</Text>
        </View>
      </View>
    );
  }

  // Error
  if (fatFinderError) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="search-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.cardTitle}>{t('fatFinder.title')}</Text>
        </View>
        {monthPicker}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.danger} />
          <Text style={styles.errorText}>{fatFinderError}</Text>
        </View>
      </View>
    );
  }

  // Empty state
  if (!fatFinderReport || fatFinderReport.findings.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="search-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.cardTitle}>{t('fatFinder.title')}</Text>
        </View>
        {monthPicker}
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={32} color={theme.colors.success} />
          <Text style={styles.emptyText}>{t('fatFinder.noFindings')}</Text>
        </View>
      </View>
    );
  }

  const topFindings = fatFinderReport.findings.slice(0, 3);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push('/fat-finder')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="search-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.cardTitle}>{t('fatFinder.title')}</Text>
      </View>

      {/* Month picker */}
      {monthPicker}

      {/* Total savings */}
      <View style={styles.savingsRow}>
        <Text style={styles.savingsLabel}>{t('fatFinder.potentialSavings')}</Text>
        <Text style={styles.savingsAmount}>
          {formatCurrency(fatFinderReport.totalPotentialSavings, currency)}
        </Text>
        <Text style={styles.savingsPerMonth}>{t('fatFinder.perMonth')}</Text>
      </View>

      {/* Top 3 findings */}
      {topFindings.map((finding) => (
        <View key={finding.id} style={styles.findingItem}>
          <View
            style={[
              styles.findingSeverityDot,
              { backgroundColor: severityColors[finding.severity] },
            ]}
          />
          <Text style={styles.findingTitle} numberOfLines={1}>
            {finding.title}
          </Text>
          <Text
            style={[
              styles.findingSavings,
              { color: severityColors[finding.severity] },
            ]}
          >
            {formatCurrency(finding.potentialSavings, currency)}
          </Text>
        </View>
      ))}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },

  // Month picker
  monthPickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  monthPickerLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 140,
    textAlign: 'center' as const,
  },

  // Savings
  savingsRow: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
  },
  savingsLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[1],
  },
  savingsAmount: {
    ...theme.textStyles.h2,
    color: theme.colors.primary,
    fontWeight: '700' as const,
  },
  savingsPerMonth: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },

  // Finding items
  findingItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    gap: theme.spacing[2],
  },
  findingSeverityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  findingTitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  findingSavings: {
    ...theme.textStyles.bodySmMedium,
    fontWeight: '600' as const,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[5],
    gap: theme.spacing[2],
  },
  loadingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },

  // Error
  errorContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    flex: 1,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[5],
    gap: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },

  // Upgrade
  upgradeContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[4],
    gap: theme.spacing[2],
  },
  upgradeText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  upgradeButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  upgradeButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
});
