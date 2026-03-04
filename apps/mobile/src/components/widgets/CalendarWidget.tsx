import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useCalendarData } from '@/hooks/useCalendarData';

interface CalendarWidgetProps {
  refreshKey?: number;
}

export function CalendarWidget({ refreshKey: _refreshKey = 0 }: CalendarWidgetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const isCurrentPeriod =
    selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const goToPrevPeriod = useCallback(() => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const goToNextPeriod = useCallback(() => {
    if (isCurrentPeriod) return;
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [selectedMonth, isCurrentPeriod]);

  const {
    calendarGrid,
    monthLabel,
    weekDayLabels,
    totalIncome,
    totalExpenses,
    netProfit,
    displayCurrency,
  } = useCalendarData(selectedMonth, selectedYear);

  const navigateToCalendar = useCallback(() => {
    router.push({
      pathname: '/calendar',
      params: { month: String(selectedMonth), year: String(selectedYear) },
    });
  }, [selectedMonth, selectedYear]);

  return (
    <View style={styles.card}>
      {/* Header pill */}
      <View style={styles.headerRow}>
        <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.cardTitle}>{t('calendar.title')}</Text>
      </View>

      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goToPrevPeriod} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={goToNextPeriod}
          hitSlop={8}
          disabled={isCurrentPeriod}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={isCurrentPeriod ? theme.colors.textDisabled : theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Weekday headers */}
      <View style={styles.weekRow}>
        {weekDayLabels.map((label, i) => (
          <View key={i} style={styles.dayCell}>
            <Text style={styles.weekDayLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {calendarGrid.map((week, rowIdx) => (
        <View key={rowIdx} style={styles.weekRow}>
          {week.map((day, colIdx) => (
            <View key={colIdx} style={styles.dayCell}>
              <View style={[styles.dayNumber, day.isToday && styles.todayCircle]}>
                <Text
                  style={[
                    styles.dayText,
                    !day.isCurrentMonth && styles.dayTextMuted,
                    day.isToday && styles.todayText,
                  ]}
                >
                  {day.date}
                </Text>
              </View>
              {day.isCurrentMonth && (
                <View style={styles.dotsRow}>
                  {day.hasIncome && <View style={[styles.dot, styles.dotIncome]} />}
                  {day.hasExpense && <View style={[styles.dot, styles.dotExpense]} />}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('calendar.income')}</Text>
          <Text style={[styles.summaryAmount, { color: theme.colors.success }]}>
            +{formatCurrency(totalIncome, displayCurrency)}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('calendar.expenses')}</Text>
          <Text style={styles.summaryAmount}>
            -{formatCurrency(totalExpenses, displayCurrency)}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.netAmount,
          { color: netProfit >= 0 ? theme.colors.success : theme.colors.danger },
        ]}
      >
        {t('calendar.netProfit')}: {netProfit >= 0 ? '+' : ''}
        {formatCurrency(netProfit, displayCurrency)}
      </Text>

      {/* Tap to details */}
      <TouchableOpacity style={styles.detailsLink} onPress={navigateToCalendar}>
        <Text style={styles.detailsText}>{t('calendar.tapToViewDetails')}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
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
  monthNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
  },
  monthLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row' as const,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 2,
  },
  weekDayLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  dayNumber: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 14,
  },
  todayCircle: {
    backgroundColor: theme.colors.primary,
  },
  dayText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  dayTextMuted: {
    color: theme.colors.textDisabled,
  },
  todayText: {
    color: '#FFFFFF',
    fontWeight: '700' as const,
  },
  dotsRow: {
    flexDirection: 'row' as const,
    gap: 2,
    height: 8,
    alignItems: 'center' as const,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotIncome: {
    backgroundColor: theme.colors.success,
  },
  dotExpense: {
    backgroundColor: theme.colors.danger,
  },
  summaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  summaryItem: {
    alignItems: 'center' as const,
  },
  summaryLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  summaryAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  netAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
  detailsLink: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: theme.spacing[3],
    gap: 4,
  },
  detailsText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
