import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import type { UserSubscription } from '@budget/shared-types';
import { useSubscriptionCalendar } from '@/hooks/useSubscriptionCalendar';

const CYCLE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  monthly: 'calendar-outline',
  yearly: 'calendar',
  quarterly: 'calendar-clear-outline',
  weekly: 'today-outline',
};

interface Props {
  subscriptions: UserSubscription[];
  selectedMonth: number;
  selectedYear: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isCurrentPeriod: boolean;
  userCurrency: string;
}

export function SubscriptionCalendarView({
  subscriptions,
  selectedMonth,
  selectedYear,
  onPrevMonth,
  onNextMonth,
  isCurrentPeriod,
  userCurrency,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { calendarGrid, weekDayLabels, monthLabel, renewalsByDay } = useSubscriptionCalendar(
    subscriptions,
    selectedMonth,
    selectedYear,
  );

  const handlePrevMonth = useCallback(() => {
    setSelectedDay(null);
    onPrevMonth();
  }, [onPrevMonth]);

  const handleNextMonth = useCallback(() => {
    setSelectedDay(null);
    onNextMonth();
  }, [onNextMonth]);

  const handleDayPress = useCallback((day: number, daySubs: UserSubscription[]) => {
    if (daySubs.length === 0) return;
    setSelectedDay((prev) => (prev === day ? null : day));
  }, []);

  const hasAnyRenewal = renewalsByDay.size > 0;
  const selectedDaySubs = selectedDay !== null ? (renewalsByDay.get(selectedDay) ?? []) : [];

  return (
    <View style={styles.container}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={handlePrevMonth} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={handleNextMonth} hitSlop={8} disabled={isCurrentPeriod}>
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
          {week.map((day, colIdx) => {
            const isSelected = selectedDay === day.date && day.isCurrentMonth;
            const activeSubs = day.subscriptions.filter((s) => s.isActive);
            const inactiveSubs = day.subscriptions.filter((s) => !s.isActive);
            const firstSub = day.subscriptions[0];
            const truncatedName =
              firstSub && firstSub.name.length > 8
                ? firstSub.name.slice(0, 7) + '…'
                : firstSub?.name;

            return (
              <TouchableOpacity
                key={colIdx}
                style={styles.dayCell}
                onPress={() => day.isCurrentMonth && handleDayPress(day.date, day.subscriptions)}
                disabled={!day.isCurrentMonth || day.subscriptions.length === 0}
                activeOpacity={day.subscriptions.length > 0 ? 0.7 : 1}
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
                {day.isCurrentMonth && day.subscriptions.length > 0 && (
                  <View style={styles.subIndicator}>
                    <View style={styles.dotsRow}>
                      {activeSubs.slice(0, 3).map((_, i) => (
                        <View key={`a${i}`} style={[styles.dot, styles.dotActive]} />
                      ))}
                      {inactiveSubs.slice(0, 2).map((_, i) => (
                        <View key={`i${i}`} style={[styles.dot, styles.dotInactive]} />
                      ))}
                    </View>
                    <Text style={styles.subName} numberOfLines={1}>
                      {truncatedName}
                    </Text>
                  </View>
                )}
                {day.isCurrentMonth && day.subscriptions.length === 0 && (
                  <View style={styles.emptyDotsRow} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Empty state */}
      {!hasAnyRenewal && (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={36} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('subscriptionManager.noRenewalsThisMonth')}</Text>
        </View>
      )}

      {/* Drill-down for selected day */}
      {selectedDay !== null && selectedDaySubs.length > 0 && (
        <View style={styles.drillDown}>
          <View style={styles.drillDownHeader}>
            <Text style={styles.drillDownTitle}>
              {t('subscriptionManager.renewalsOnDay', { day: selectedDay })}
            </Text>
            <TouchableOpacity onPress={() => setSelectedDay(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
          {selectedDaySubs.map((sub) => (
            <View key={sub.id} style={[styles.drillItem, !sub.isActive && styles.drillItemInactive]}>
              <View style={[styles.drillIcon, { backgroundColor: sub.isActive ? theme.colors.primaryLight : theme.colors.background }]}>
                <Ionicons
                  name={CYCLE_ICONS[sub.billingCycle] || 'calendar-outline'}
                  size={18}
                  color={sub.isActive ? theme.colors.primary : theme.colors.textTertiary}
                />
              </View>
              <View style={styles.drillInfo}>
                <Text style={[styles.drillName, !sub.isActive && styles.drillInactiveText]}>
                  {sub.name}
                </Text>
                <Text style={styles.drillCycle}>
                  {t(`subscriptionManager.cycle.${sub.billingCycle}`)}
                  {!sub.isActive ? ` · ${t('subscriptionManager.inactive')}` : ''}
                </Text>
              </View>
              <Text style={[styles.drillAmount, !sub.isActive && styles.drillInactiveText]}>
                {formatCurrency(sub.amount, sub.currencyCode as any)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  monthNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[1],
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
    paddingVertical: theme.spacing[1],
    minHeight: 56,
  },
  weekDayLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  dayNumber: {
    width: 26,
    height: 26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 13,
  },
  todayCircle: {
    backgroundColor: theme.colors.primary,
  },
  selectedCircle: {
    backgroundColor: theme.colors.primaryLight,
  },
  dayText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
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
    fontWeight: '700' as const,
  },
  subIndicator: {
    alignItems: 'center' as const,
    width: '100%' as const,
    paddingHorizontal: 1,
  },
  dotsRow: {
    flexDirection: 'row' as const,
    gap: 2,
    height: 6,
    alignItems: 'center' as const,
    marginTop: 2,
  },
  emptyDotsRow: {
    height: 6,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    backgroundColor: theme.colors.primary,
  },
  dotInactive: {
    backgroundColor: theme.colors.textDisabled,
  },
  subName: {
    fontSize: 9,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: 1,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  drillDown: {
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing[2],
  },
  drillDownHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[1],
  },
  drillDownTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  drillItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  drillItemInactive: {
    opacity: 0.55,
  },
  drillIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  drillInfo: {
    flex: 1,
    gap: 2,
  },
  drillName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  drillCycle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  drillAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  drillInactiveText: {
    color: theme.colors.textTertiary,
  },
});
