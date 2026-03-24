import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useCalendarData, type TransactionItem } from '@/hooks/useCalendarData';
import { getIntlLocale } from '@/i18n';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const params = useLocalSearchParams<{ month?: string; year?: string }>();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    params.month ? Number(params.month) : now.getMonth() + 1,
  );
  const [selectedYear, setSelectedYear] = useState(
    params.year ? Number(params.year) : now.getFullYear(),
  );
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const isCurrentPeriod =
    selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const goToPrevPeriod = useCallback(() => {
    setSelectedDay(null);
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const goToNextPeriod = useCallback(() => {
    if (isCurrentPeriod) return;
    setSelectedDay(null);
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
    transactions,
    displayCurrency,
  } = useCalendarData(selectedMonth, selectedYear, selectedDay);

  const handleDayPress = useCallback(
    (day: number) => {
      setSelectedDay((prev) => (prev === day ? null : day));
    },
    [],
  );

  const renderTransaction = useCallback(
    ({ item }: { item: TransactionItem }) => {
      const isExpense = item.type === 'expense';
      const locale = getIntlLocale();
      return (
        <View style={styles.transactionRow}>
          <View style={[styles.transactionIcon, { backgroundColor: item.categoryColor + '20' }]}>
            <Ionicons
              name={(item.categoryIcon as keyof typeof Ionicons.glyphMap) || 'ellipsis-horizontal'}
              size={18}
              color={item.categoryColor}
            />
          </View>
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionDesc} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.transactionDate}>
              {item.date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Text
            style={[
              styles.transactionAmount,
              { color: isExpense ? theme.colors.danger : theme.colors.success },
            ]}
          >
            {isExpense ? '-' : '+'}
            {formatCurrency(item.convertedAmount, displayCurrency)}
          </Text>
        </View>
      );
    },
    [styles, theme.colors, displayCurrency],
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={goToPrevPeriod} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity
            onPress={goToNextPeriod}
            hitSlop={8}
            disabled={isCurrentPeriod}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
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
            {week.map((day, colIdx) => {
              const isSelected = selectedDay === day.date && day.isCurrentMonth;
              return (
                <TouchableOpacity
                  key={colIdx}
                  style={styles.dayCell}
                  onPress={() => day.isCurrentMonth && handleDayPress(day.date)}
                  disabled={!day.isCurrentMonth}
                >
                  <View
                    style={[
                      styles.dayNumber,
                      day.isToday && styles.todayCircle,
                      isSelected && !day.isToday && styles.selectedCircle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !day.isCurrentMonth && styles.dayTextMuted,
                        day.isToday && styles.todayText,
                        isSelected && !day.isToday && styles.selectedText,
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
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Selected day indicator */}
        {selectedDay !== null && (
          <TouchableOpacity style={styles.selectedDayChip} onPress={() => setSelectedDay(null)}>
            <Text style={styles.selectedDayText}>
              {selectedDay} {monthLabel.split(' ')[0]}
            </Text>
            <Ionicons name="close-circle" size={16} color={theme.colors.primary} />
          </TouchableOpacity>
        )}

        {/* Transactions */}
        <View style={styles.tabContent}>
          {transactions.length > 0 ? (
            transactions.map((item) => (
              <View key={item.id}>{renderTransaction({ item })}</View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyText}>{t('calendar.noTransactions')}</Text>
            </View>
          )}
        </View>
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
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  monthNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
  },
  monthLabel: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row' as const,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 3,
  },
  weekDayLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  dayNumber: {
    width: 32,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 16,
  },
  todayCircle: {
    backgroundColor: theme.colors.primary,
  },
  selectedCircle: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  dayText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  dayTextMuted: {
    color: theme.colors.textDisabled,
  },
  todayText: {
    color: '#FFFFFF',
    fontWeight: '700' as const,
  },
  selectedText: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
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
  selectedDayChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    gap: 6,
    marginTop: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
  },
  selectedDayText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  tabContent: {
    marginTop: theme.spacing[4],
  },
  // Transactions
  transactionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    gap: theme.spacing[2],
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDesc: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  transactionDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  transactionAmount: {
    ...theme.textStyles.bodyMedium,
    minWidth: 80,
    textAlign: 'right' as const,
  },
  // Empty state
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
