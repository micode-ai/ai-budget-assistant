import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserSubscription, BillingCycle } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';

export interface SubCalendarDay {
  date: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  subscriptions: UserSubscription[];
}

function addCycle(date: Date, cycle: BillingCycle): Date {
  const next = new Date(date);
  switch (cycle) {
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next;
}

function subtractCycle(date: Date, cycle: BillingCycle): Date {
  const prev = new Date(date);
  switch (cycle) {
    case 'weekly': prev.setDate(prev.getDate() - 7); break;
    case 'monthly': prev.setMonth(prev.getMonth() - 1); break;
    case 'quarterly': prev.setMonth(prev.getMonth() - 3); break;
    case 'yearly': prev.setFullYear(prev.getFullYear() - 1); break;
  }
  return prev;
}

function getRenewalsInMonth(sub: UserSubscription, year: number, month: number): number[] {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Parse nextRenewalDate (ISO date string "YYYY-MM-DD")
  const parts = sub.nextRenewalDate.split('T')[0].split('-');
  let current = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  // Step back until current <= monthEnd
  while (current > monthEnd) {
    current = subtractCycle(current, sub.billingCycle);
  }

  // Step forward until current >= monthStart
  while (current < monthStart) {
    current = addCycle(current, sub.billingCycle);
  }

  const days: number[] = [];
  // Guard against infinite loops for pathological dates
  let safety = 0;
  while (current <= monthEnd && safety < 10) {
    days.push(current.getDate());
    current = addCycle(current, sub.billingCycle);
    safety++;
  }

  return days;
}

export function useSubscriptionCalendar(
  subscriptions: UserSubscription[],
  selectedMonth: number,
  selectedYear: number,
) {
  const { i18n } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const locale = useMemo(() => getIntlLocale(), [i18n.language]);

  const weekDayLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 0, 5 + i); // Jan 5 2026 = Monday
      labels.push(d.toLocaleDateString(locale, { weekday: 'narrow' }));
    }
    return labels;
  }, [locale]);

  const monthLabel = useMemo(() => {
    const date = new Date(selectedYear, selectedMonth - 1, 1);
    const name = date.toLocaleDateString(locale, { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${selectedYear}`;
  }, [selectedMonth, selectedYear, locale]);

  const renewalsByDay = useMemo<Map<number, UserSubscription[]>>(() => {
    const map = new Map<number, UserSubscription[]>();
    for (const sub of subscriptions) {
      const days = getRenewalsInMonth(sub, selectedYear, selectedMonth);
      for (const day of days) {
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(sub);
      }
    }
    return map;
  }, [subscriptions, selectedMonth, selectedYear]);

  const calendarGrid = useMemo<SubCalendarDay[][]>(() => {
    const today = new Date();
    const isCurrentMonthYear =
      today.getMonth() === selectedMonth - 1 && today.getFullYear() === selectedYear;
    const todayDate = today.getDate();

    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const firstDayOfWeek = new Date(selectedYear, selectedMonth - 1, 1).getDay();
    const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const prevMonthDays = new Date(selectedYear, selectedMonth - 1, 0).getDate();

    const grid: SubCalendarDay[][] = [];
    let dayCounter = 1;
    let nextMonthDay = 1;

    for (let row = 0; row < 6; row++) {
      const week: SubCalendarDay[] = [];
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        if (cellIndex < mondayOffset) {
          week.push({
            date: prevMonthDays - mondayOffset + cellIndex + 1,
            isCurrentMonth: false,
            isToday: false,
            subscriptions: [],
          });
        } else if (dayCounter <= daysInMonth) {
          week.push({
            date: dayCounter,
            isCurrentMonth: true,
            isToday: isCurrentMonthYear && dayCounter === todayDate,
            subscriptions: renewalsByDay.get(dayCounter) ?? [],
          });
          dayCounter++;
        } else {
          week.push({
            date: nextMonthDay,
            isCurrentMonth: false,
            isToday: false,
            subscriptions: [],
          });
          nextMonthDay++;
        }
      }
      grid.push(week);
      if (dayCounter > daysInMonth) break;
    }

    return grid;
  }, [selectedMonth, selectedYear, renewalsByDay]);

  const totalRenewalAmount = useMemo(() => {
    let total = 0;
    for (const [, subs] of renewalsByDay) {
      for (const sub of subs) {
        if (sub.isActive) total += sub.amount;
      }
    }
    return total;
  }, [renewalsByDay]);

  return { calendarGrid, renewalsByDay, weekDayLabels, monthLabel, totalRenewalAmount };
}
