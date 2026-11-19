import React from 'react';
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { PetCostKind, PetHistory, PetHistoryItem, PetHistoryPeriod } from '@budget/shared-types';
import { InteractiveBarChart } from '@/components/interactive-charts/InteractiveBarChart';
import { monthLabels } from '@/features/children/childCostsDisplay';
import { PET_KIND_COLORS, PET_PERIODS, parsePetDay, petItemCaption, type PetKindRow } from '@/features/pets/petDisplay';
import { getIntlLocale } from '@/i18n';
import { useExpenseStore } from '@/stores/expenseStore';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Pieces both pet-screen layouts (phone and desktop) draw identically
 * (ABA-831), in the vehicle screen's shape. Every number arrives from
 * `usePetDetail`; nothing here fetches.
 */

export function PetPeriodChips({
  period,
  onChange,
}: {
  period: PetHistoryPeriod;
  onChange: (p: PetHistoryPeriod) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('pets.periodA11y')}>
      {PET_PERIODS.map((p) => {
        const selected = p === period;
        return (
          <TouchableOpacity
            key={p}
            onPress={() => onChange(p)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{t(`pets.period_${p}`)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Loading, failed or unknown pet — each its own state, never a zero total. */
export function PetDetailStatus({ kind, onRetry }: { kind: 'loading' | 'error' | 'notFound'; onRetry?: () => void }) {
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
      <Ionicons name={kind === 'error' ? 'alert-circle-outline' : 'paw-outline'} size={40} color={theme.colors.textTertiary} />
      <Text style={styles.statusText}>{t(kind === 'error' ? 'pets.loadFailed' : 'pets.notFound')}</Text>
      {kind === 'error' && onRetry && (
        <TouchableOpacity style={styles.retry} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Shown only when some amounts were left out for want of an exchange rate. */
export function PetFxNotice() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Text style={styles.noticeText}>{t('pets.fxApproxNotice')}</Text>
    </View>
  );
}

/** The E2EE note (see `usePetEncryptionNote`); renders nothing on an unencrypted account. */
export function PetEncryptionNote({ note }: { note: 'none' | 'locked' | 'plain' }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (note === 'none') return null;
  return (
    <View style={styles.lockNote} accessibilityRole="text">
      <Ionicons name={note === 'locked' ? 'lock-closed-outline' : 'shield-checkmark-outline'} size={16} color={theme.colors.textSecondary} />
      <Text style={styles.lockNoteText}>{t(note === 'locked' ? 'pets.e2eeLocked' : 'pets.e2eeNote')}</Text>
    </View>
  );
}

/** The four headline figures of the period, as label/value pairs; each layout draws its own tile. */
export function usePetTiles(history: PetHistory | null) {
  const { t } = useTranslation();
  const empty = !history || history.items.length === 0;
  const money = (n: number) => (history ? formatCurrency(n, history.currencyCode) : '—');
  return [
    { key: 'total', label: t('pets.tileTotal'), value: empty ? '—' : money(history!.total) },
    { key: 'perMonth', label: t('pets.tilePerMonth'), value: empty ? '—' : money(history!.perMonth) },
    // The year figure is independent of the picked period, so it shows even when the period is empty.
    { key: 'year', label: t('pets.tileYear'), value: history ? money(history.yearTotal) : '—' },
    { key: 'count', label: t('pets.tileCount'), value: history ? String(history.items.length) : '—' },
  ];
}

/** Costs by calendar month; tapping a bar picks that month, tapping it again clears it. */
export function PetMonthBars({
  history,
  month,
  onSelect,
}: {
  history: PetHistory;
  month: string | null;
  onSelect: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (history.items.length === 0) return <Text style={styles.emptyNote}>{t('pets.noCostsPeriod')}</Text>;
  const locale = getIntlLocale();
  // Over a year of bars, a label on every bar would overlap: label every third month instead.
  const sparse = history.monthly.length > 12;
  const data = history.monthly.map((m, i) => ({
    id: m.month,
    label: sparse && i % 3 !== 0 ? '' : monthLabels(m.month, locale).short,
    value: m.total,
    color: !month || m.month === month ? theme.colors.primary : theme.colors.primaryLight,
  }));
  const a11y = t('pets.chartA11y', {
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
      <Text style={styles.hint}>{t('pets.monthHint')}</Text>
    </View>
  );
}

/** "Showing March 2026 · Show all" above a narrowed breakdown and list. */
export function PetMonthFilterBar({ month, onClear }: { month: string; onClear: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.filterBar}>
      <Text style={styles.filterText}>{t('pets.showingMonth', { month: monthLabels(month, getIntlLocale()).long })}</Text>
      <TouchableOpacity onPress={onClear} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.link}>{t('pets.showAll')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Kinds of cost with their share; tapping one narrows the list to it. */
export function PetKindBreakdown({
  rows,
  currency,
  kind,
  onSelectKind,
}: {
  rows: PetKindRow[];
  currency: string;
  kind: PetCostKind | null;
  onSelectKind: (k: PetCostKind | null) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  if (rows.length === 0) return <Text style={styles.emptyNote}>{t('pets.noCostsPeriod')}</Text>;
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
                {t(`pets.kind_${r.id}`)}
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

/**
 * Every cost of the (narrowed) period, newest first; a row opens its expense.
 * Editors get a remove button beside each row (a sibling, not nested in the
 * row's Pressable — nested buttons are invalid on web).
 */
export function PetItemList({
  items,
  petName,
  canEdit,
  onRemove,
}: {
  items: PetHistoryItem[];
  petName: string;
  canEdit: boolean;
  onRemove: (expenseId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const expenses = useExpenseStore((s) => s.expenses);
  if (items.length === 0) return <Text style={styles.emptyNote}>{t('pets.itemsEmpty')}</Text>;
  const locale = getIntlLocale();
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  const confirmRemove = (expenseId: string) =>
    showAlert(t('pets.removeCostTitle', { name: petName }), t('pets.removeCostMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('pets.removeCost'),
        style: 'destructive',
        onPress: async () => {
          try {
            await onRemove(expenseId);
          } catch (e) {
            console.warn('[pets] remove cost failed:', e instanceof Error ? e.message : String(e));
            showAlert(t('common.error'), t('pets.saveFailed'));
          }
        },
      },
    ]);

  return (
    <View>
      {items.map((item, i) => {
        const local = expenses.find(
          (e) => e.serverId === item.expenseId || e.id === item.expenseId || (!!item.clientId && e.clientId === item.clientId),
        );
        const caption = petItemCaption(item, local);
        return (
          <View key={item.expenseId} style={[styles.itemRow, i > 0 && styles.divider]}>
            <Pressable
              onPress={() => router.push(`/expense/${item.expenseId}` as any)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.itemMain, pressed && styles.pressed]}
            >
              <View style={[styles.dot, { backgroundColor: PET_KIND_COLORS[item.kind] ?? PET_KIND_COLORS.other }]} />
              <View style={styles.itemText}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {t(`pets.kind_${item.kind}`)} · {day.format(parsePetDay(item.date))}
                </Text>
                {!!caption && (
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {caption}
                  </Text>
                )}
              </View>
              <Text style={styles.amount}>{formatCurrency(item.amount, item.currencyCode)}</Text>
            </Pressable>
            {canEdit && (
              <TouchableOpacity
                onPress={() => confirmRemove(item.expenseId)}
                hitSlop={8}
                style={styles.removeButton}
                accessibilityRole="button"
                accessibilityLabel={t('pets.removeCost')}
              >
                <Ionicons name="close-circle-outline" size={20} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
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
  lockNote: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  lockNoteText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flex: 1 },
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
  itemRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  itemMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  removeButton: { padding: theme.spacing[1] },
  pressed: { backgroundColor: theme.colors.surfaceSecondary },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  itemSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
});
