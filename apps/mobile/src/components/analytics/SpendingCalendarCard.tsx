import { useState } from 'react';
import { View, Text, Pressable, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { SpendingCalendar } from '@/features/analytics/useSpendingCalendar';
import type { HeatmapCell } from '@/features/analytics/spendingCalendar';

interface Props {
  data: SpendingCalendar;
  currency: string;
}

const GAP = 2;
const LABEL_WIDTH = 22;
const MAX_CELL = 20;
/** Below this a cell stops reading as a day; a narrow card shows fewer weeks instead. */
const MIN_CELL = 9;
const BAR_HEIGHT = 64;
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1];

/**
 * "When I spend" (ABA-798): a year of days as a week × weekday grid, shaded by
 * quartile of spending, and the average spend on each day of the month. Dates
 * only — there is no purchase time to show an hour. Tapping a day names it.
 * Cells size themselves to the card's width: the whole year on desktop, the
 * most recent weeks that fit at a readable size on a phone. Shared by both layouts.
 */
export function SpendingCalendarCard({ data, currency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<HeatmapCell | null>(null);

  // As many of the most recent weeks as fit at MIN_CELL or more: the whole
  // year on desktop, about half of it on a phone. Peak and counts follow.
  const allWeeks = data.heatmap.weeks;
  const fit = width > 0 ? Math.max(1, Math.floor((width - LABEL_WIDTH) / (MIN_CELL + GAP))) : allWeeks.length;
  const weeks = allWeeks.slice(-Math.min(allWeeks.length, fit));
  const cell = width > 0 ? Math.min(MAX_CELL, Math.floor((width - LABEL_WIDTH) / weeks.length) - GAP) : 0;
  const shownCells = weeks.flat();
  const activeDays = shownCells.filter((c) => c.amount > 0).length;
  const peak = shownCells.reduce<HeatmapCell | null>((p, c) => (c.amount > 0 && (!p || c.amount > p.amount) ? c : p), null);
  const months = Math.max(1, Math.round((weeks.length * 7) / 30.44));
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // Row labels for Monday, Wednesday and Friday (Monday-started weeks).
  const rowLabels = weeks[0].map((c, i) => (i % 2 === 0 && i < 6 ? weekdayFormat.format(c.date) : ''));

  const shown = selected ?? peak;
  const caption = shown
    ? t(selected ? 'analytics.calendarDay' : 'analytics.calendarPeak', {
        date: dayFormat.format(shown.date),
        amount: formatCurrency(shown.amount, currency),
      })
    : '';

  const { averages, busiestStart } = data.dayOfMonth;
  const maxAvg = Math.max(...averages, 0) || 1;
  const inBusiest = (i: number) => busiestStart !== null && i >= busiestStart && i < busiestStart + 3;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.calendarTitle')}</Text>
      <View style={styles.card} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 32)}>
        <Text style={styles.subtitle}>{t('analytics.calendarSubtitle', { days: activeDays, months })}</Text>

        {cell > 0 && (
          <View style={styles.grid} accessibilityRole="image" accessibilityLabel={caption}>
            <View style={{ width: LABEL_WIDTH }}>
              {rowLabels.map((label, i) => (
                <Text key={i} style={[styles.rowLabel, { height: cell, marginBottom: GAP, lineHeight: cell }]}>
                  {label}
                </Text>
              ))}
            </View>
            {weeks.map((col, w) => (
              <View key={w} style={{ marginRight: GAP }}>
                {col.map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={c.future ? undefined : () => setSelected(selected?.key === c.key ? null : c)}
                    style={[
                      styles.cell,
                      { width: cell, height: cell, marginBottom: GAP },
                      c.future
                        ? styles.cellFuture
                        : c.level === 0
                          ? styles.cellEmpty
                          : { backgroundColor: theme.colors.primary, opacity: LEVEL_OPACITY[c.level] },
                      selected?.key === c.key && styles.cellSelected,
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        <View style={styles.legendRow}>
          <Text style={styles.caption} numberOfLines={2}>
            {caption}
          </Text>
          <View style={styles.legend}>
            <Text style={styles.legendText}>{t('analytics.calendarLess')}</Text>
            {LEVEL_OPACITY.map((o, i) => (
              <View
                key={i}
                style={[styles.legendCell, i === 0 ? styles.cellEmpty : { backgroundColor: theme.colors.primary, opacity: o }]}
              />
            ))}
            <Text style={styles.legendText}>{t('analytics.calendarMore')}</Text>
          </View>
        </View>

        {data.dayOfMonth.months > 0 && (
          <View style={styles.domBlock}>
            <Text style={styles.domTitle}>
              {data.anchored ? t('analytics.calendarByDayAnchored') : t('analytics.calendarByDay')}
            </Text>
            <View style={styles.bars}>
              {averages.map((a, i) => (
                <View key={i} style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(2, (a / maxAvg) * BAR_HEIGHT),
                        backgroundColor: inBusiest(i) ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.axisRow}>
              <Text style={styles.axisLabel}>1</Text>
              <Text style={styles.axisLabel}>10</Text>
              <Text style={styles.axisLabel}>20</Text>
              <Text style={styles.axisLabel}>31</Text>
            </View>
            {busiestStart !== null && (
              <Text style={styles.caption}>
                {t('analytics.calendarBusiest', {
                  from: busiestStart + 1,
                  to: busiestStart + 3,
                  months: data.dayOfMonth.months,
                })}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[5] },
  sectionTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  subtitle: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[3] },
  grid: { flexDirection: 'row' as const },
  rowLabel: { ...theme.textStyles.caption, fontSize: 9, color: theme.colors.textTertiary },
  cell: { borderRadius: 2 },
  cellEmpty: { backgroundColor: theme.colors.surfaceSecondary },
  cellFuture: { backgroundColor: 'transparent' },
  cellSelected: { borderWidth: 1.5, borderColor: theme.colors.textPrimary },
  legendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  caption: { ...theme.textStyles.caption, color: theme.colors.textSecondary, flexShrink: 1 },
  legend: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3 },
  legendText: { ...theme.textStyles.caption, fontSize: 10, color: theme.colors.textTertiary },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
  domBlock: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  domTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  bars: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, height: BAR_HEIGHT },
  barSlot: { flex: 1, marginHorizontal: 1, justifyContent: 'flex-end' as const },
  bar: { borderRadius: 2 },
  axisRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 2, marginBottom: theme.spacing[2] },
  axisLabel: { ...theme.textStyles.caption, fontSize: 10, color: theme.colors.textTertiary },
});
