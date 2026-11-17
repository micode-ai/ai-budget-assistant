import React from 'react';
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { VehicleCostKind, VehicleHistory, VehicleHistoryItem, VehicleHistoryPeriod } from '@budget/shared-types';
import { InteractiveBarChart } from '@/components/interactive-charts/InteractiveBarChart';
import { InteractiveLineChart } from '@/components/interactive-charts/InteractiveLineChart';
import { monthLabels } from '@/features/children/childCostsDisplay';
import {
  KIND_COLORS,
  VEHICLE_PERIODS,
  itemCaption,
  type VehicleKindRow,
} from '@/features/vehicles/vehicleDetailDisplay';
import { formatConsumption, formatKm, parseDay } from '@/features/vehicles/vehicleDisplay';
import { getIntlLocale } from '@/i18n';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Pieces both vehicle-screen layouts (phone and desktop) draw identically
 * (ABA-811). Every number arrives from `useVehicleDetail`; nothing here fetches.
 */

export function PeriodChips({
  period,
  onChange,
}: {
  period: VehicleHistoryPeriod;
  onChange: (p: VehicleHistoryPeriod) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('vehicles.periodA11y')}>
      {VEHICLE_PERIODS.map((p) => {
        const selected = p === period;
        return (
          <TouchableOpacity
            key={p}
            onPress={() => onChange(p)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{t(`vehicles.period_${p}`)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Loading, failed or unknown vehicle — each its own state, never a zero total. */
export function VehicleDetailStatus({ kind, onRetry }: { kind: 'loading' | 'error' | 'notFound'; onRetry?: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (kind === 'loading') {
    return (
      <View style={styles.status} accessibilityLabel={t('common.loading')}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  return (
    <View style={styles.status}>
      <Ionicons name={kind === 'error' ? 'alert-circle-outline' : 'car-outline'} size={40} color={theme.colors.textTertiary} />
      <Text style={styles.statusText}>{t(kind === 'error' ? 'vehicles.loadFailed' : 'vehicles.notFound')}</Text>
      {kind === 'error' && onRetry && (
        <TouchableOpacity style={styles.retry} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Shown only when some amounts were left out for want of an exchange rate. */
export function VehicleFxNotice() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Text style={styles.noticeText}>{t('vehicles.fxApproxNotice')}</Text>
    </View>
  );
}

/** The four headline figures of the period, as label/value pairs; each layout draws its own tile. */
export function useVehicleTiles(history: VehicleHistory | null, unit: string) {
  const { t } = useTranslation();
  const locale = getIntlLocale();
  const empty = !history || history.items.length === 0;
  const money = (n: number) => (history ? formatCurrency(n, history.currencyCode) : '—');
  const consumption = history ? formatConsumption(history.consumptionLPer100Km, locale) : null;
  return [
    { key: 'total', label: t('vehicles.tileTotal'), value: empty ? '—' : money(history!.total) },
    { key: 'perMonth', label: t('vehicles.tilePerMonth'), value: empty ? '—' : money(history!.perMonth) },
    {
      key: 'perKm',
      label: t('vehicles.allCostPerKm'),
      value: history?.costPerKm != null ? money(history.costPerKm) : '—',
      sub: history && history.km > 0 ? t('vehicles.distance', { km: formatKm(history.km, locale) }) : undefined,
    },
    {
      key: 'consumption',
      label: t('vehicles.tileConsumption'),
      value: consumption ? `${consumption} ${t('vehicles.per100', { unit })}` : '—',
    },
  ];
}

/** Costs by calendar month; tapping a bar picks that month, tapping it again clears it. */
export function VehicleMonthBars({
  history,
  month,
  onSelect,
}: {
  history: VehicleHistory;
  month: string | null;
  onSelect: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (history.items.length === 0) return <Text style={styles.emptyNote}>{t('vehicles.noCostsPeriod')}</Text>;
  const locale = getIntlLocale();
  // Over a year of bars, a label on every bar would overlap: label every third month instead.
  const sparse = history.monthly.length > 12;
  const data = history.monthly.map((m, i) => ({
    id: m.month,
    label: sparse && i % 3 !== 0 ? '' : monthLabels(m.month, locale).short,
    value: m.total,
    color: !month || m.month === month ? theme.colors.primary : theme.colors.primaryLight,
  }));
  const a11y = t('vehicles.chartA11y', {
    list: history.monthly
      .map((m) => `${monthLabels(m.month, locale).long}: ${formatCurrency(m.total, history.currencyCode)}`)
      .join('; '),
  });
  return (
    <View accessible accessibilityLabel={a11y}>
      <InteractiveBarChart
        data={data}
        height={180}
        animate={false}
        formatValue={(v) => formatCurrency(v, history.currencyCode)}
        onBarPress={(item) => onSelect(item.id === month ? null : (item.id ?? null))}
      />
      <Text style={styles.hint}>{t('vehicles.monthHint')}</Text>
    </View>
  );
}

/** "Showing March 2026 · Show all" above a narrowed breakdown and list. */
export function MonthFilterBar({ month, onClear }: { month: string; onClear: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.filterBar}>
      <Text style={styles.filterText}>{t('vehicles.showingMonth', { month: monthLabels(month, getIntlLocale()).long })}</Text>
      <TouchableOpacity onPress={onClear} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.link}>{t('vehicles.showAll')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Kinds of cost with their share; tapping one narrows the list to it. */
export function KindBreakdown({
  rows,
  currency,
  kind,
  onSelectKind,
}: {
  rows: VehicleKindRow[];
  currency: string;
  kind: VehicleCostKind | null;
  onSelectKind: (k: VehicleCostKind | null) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  if (rows.length === 0) return <Text style={styles.emptyNote}>{t('vehicles.noCostsPeriod')}</Text>;
  return (
    <View>
      {rows.map((r, i) => {
        const selected = kind === r.id;
        return (
          <Pressable
            key={r.id}
            onPress={() => onSelectKind(selected ? null : r.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.kindRow, i > 0 && styles.divider, selected && styles.kindRowSelected]}
          >
            <View style={styles.kindTop}>
              <View style={[styles.dot, { backgroundColor: r.color }]} />
              <Text style={styles.kindName} numberOfLines={1}>
                {t(`vehicles.kind_${r.id}`)}
              </Text>
              <Text style={styles.kindPct}>{Math.round(r.percentage)}%</Text>
              <Text style={styles.amount}>{formatCurrency(r.amount, currency)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(2, r.percentage)}%`, backgroundColor: r.color }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Consumption per full-tank segment ending in the period. */
export function ConsumptionChart({ history, unit }: { history: VehicleHistory; unit: string }) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  if (history.consumption.length === 0) return <Text style={styles.emptyNote}>{t('vehicles.notEnough')}</Text>;
  const locale = getIntlLocale();
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const data = history.consumption.map((p) => ({ label: day.format(parseDay(p.date)), value: p.lPer100Km }));
  const fmt = (v: number) => `${formatConsumption(v, locale)} ${unit}`;
  return (
    <View
      accessible
      accessibilityLabel={t('vehicles.consumptionA11y', {
        list: history.consumption.map((p) => `${day.format(parseDay(p.date))}: ${fmt(p.lPer100Km)}`).join('; '),
      })}
    >
      <InteractiveLineChart data={data} height={160} animate={false} areaChart={false} formatValue={fmt} />
    </View>
  );
}

/** Every fill-up and cost of the (narrowed) period, newest first; a row opens its expense. */
export function VehicleItemList({ items, unit }: { items: VehicleHistoryItem[]; unit: string }) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const expenses = useExpenseStore((s) => s.expenses);
  if (items.length === 0) return <Text style={styles.emptyNote}>{t('vehicles.itemsEmpty')}</Text>;
  const locale = getIntlLocale();
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <View>
      {items.map((item, i) => {
        const local = expenses.find(
          (e) => e.serverId === item.expenseId || e.id === item.expenseId || (!!item.clientId && e.clientId === item.clientId),
        );
        const caption = itemCaption(item, local);
        const fuelParts =
          item.liters !== undefined
            ? [
                `${Number(item.liters).toLocaleString(locale)} ${unit}`,
                `${formatKm(item.odometerKm ?? 0, locale)} km`,
                ...(item.isFullTank ? [] : [t('vehicles.partial')]),
              ]
            : [];
        const second = [caption, ...fuelParts].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={`${item.kind}-${item.expenseId}`}
            onPress={() => router.push(`/expense/${item.expenseId}` as any)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.itemRow, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            <View style={[styles.dot, { backgroundColor: KIND_COLORS[item.kind] ?? KIND_COLORS.other }]} />
            <View style={styles.itemText}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {t(`vehicles.kind_${item.kind}`)} · {day.format(parseDay(item.date))}
              </Text>
              {!!second && (
                <Text style={styles.itemSub} numberOfLines={1}>
                  {second}
                </Text>
              )}
            </View>
            <Text style={styles.amount}>{formatCurrency(item.amount, item.currencyCode)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textSecondary },
  chipTextSelected: { color: theme.colors.textInverse },
  status: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[10],
    gap: theme.spacing[3],
  },
  statusText: { ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' as const },
  retry: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
  },
  retryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  notice: {
    backgroundColor: theme.colors.warningLight,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  noticeText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  emptyNote: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[6],
  },
  hint: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[2] },
  filterBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
  },
  filterText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textPrimary, flexShrink: 1 },
  link: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  kindRow: { paddingVertical: theme.spacing[2.5], paddingHorizontal: theme.spacing[1], borderRadius: theme.borderRadius.md },
  kindRowSelected: { backgroundColor: theme.colors.surfaceSecondary },
  kindTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  kindName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  kindPct: { ...theme.textStyles.caption, color: theme.colors.textTertiary, fontVariant: ['tabular-nums' as const] },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceSecondary,
    marginTop: theme.spacing[1.5],
    overflow: 'hidden' as const,
  },
  fill: { height: 4, borderRadius: 2 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  dot: { width: 10, height: 10, borderRadius: 5 },
  amount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[1],
  },
  pressed: { backgroundColor: theme.colors.surfaceSecondary },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  itemSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
});
