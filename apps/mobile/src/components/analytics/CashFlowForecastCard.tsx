import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { CashFlowForecastResponse } from '@budget/shared-types';

interface Props {
  forecast: CashFlowForecastResponse;
}

const CHART_HEIGHT = 110;
const MAX_EVENTS = 6;

const EVENT_ICON = {
  income: 'arrow-down-circle-outline',
  subscription: 'card-outline',
  recurring: 'repeat-outline',
  planned: 'cart-outline',
  debt: 'people-outline',
} as const;

/** `YYYY-MM-DD` as a LOCAL date — never `new Date(string)`, which reads it as UTC. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The next 30 days of the balance, day by day, from
 * `GET /insights/cash-flow-forecast`. Bars rather than a line: 31 per-point
 * currency labels would be a wall, and a bar below the axis reads as "short"
 * at a glance. Shared by phone and desktop; see
 * docs/wiki/features/cash-flow-forecast.md.
 */
export function CashFlowForecastCard({ forecast }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const currency = forecast.baseCurrency;
  const dayFormat = new Intl.DateTimeFormat(getIntlLocale(), { day: 'numeric', month: 'short' });
  const fmtDay = (iso: string) => dayFormat.format(parseDay(iso));

  const balances = forecast.days.map((d) => d.balance);
  const max = Math.max(0, ...balances);
  const min = Math.min(0, ...balances);
  const span = max - min || 1;
  const zeroFromTop = (max / span) * CHART_HEIGHT;
  // "Runs short" names the FIRST day below zero — the warning is about when
  // the money runs out, not about the deepest point, which can be weeks later.
  const firstShort = forecast.days.find((d) => d.balance < 0);
  const runsShort = firstShort !== undefined;
  // Already below zero today: "may run short around <today>" reads as a
  // prediction about something that has already happened.
  const alreadyShort = forecast.days[0].balance < 0;
  const lowestIndex = forecast.days.findIndex((d) => d.date === forecast.lowest.date);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.forecastTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.headlineRow}>
          <Ionicons
            name={runsShort ? 'warning-outline' : 'trending-down-outline'}
            size={20}
            color={runsShort ? theme.colors.danger : theme.colors.textSecondary}
          />
          <Text style={[styles.headline, runsShort && { color: theme.colors.danger }]}>
            {alreadyShort
              ? t('analytics.forecastAlreadyShort')
              : runsShort
              ? t('analytics.forecastShort', { date: fmtDay(firstShort.date) })
              : t('analytics.forecastLowest', {
                  amount: formatCurrency(forecast.lowest.balance, currency),
                  date: fmtDay(forecast.lowest.date),
                })}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('analytics.forecastToday')}</Text>
            <Text style={styles.statValue}>{formatCurrency(forecast.startBalance, currency)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('analytics.forecastLowestLabel')}</Text>
            <Text style={[styles.statValue, runsShort && { color: theme.colors.danger }]}>
              {formatCurrency(forecast.lowest.balance, currency)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('analytics.forecastIn30')}</Text>
            <Text style={[styles.statValue, forecast.endBalance < 0 && { color: theme.colors.danger }]}>
              {formatCurrency(forecast.endBalance, currency)}
            </Text>
          </View>
        </View>

        <View
          style={[styles.chart, { height: CHART_HEIGHT }]}
          accessibilityRole="image"
          accessibilityLabel={t('analytics.forecastLowest', {
            amount: formatCurrency(forecast.lowest.balance, currency),
            date: fmtDay(forecast.lowest.date),
          })}
        >
          <View style={[styles.zeroLine, { top: zeroFromTop }]} />
          {forecast.days.map((day, i) => {
            const h = (Math.abs(day.balance) / span) * CHART_HEIGHT;
            const negative = day.balance < 0;
            const color = negative
              ? theme.colors.danger
              : i === lowestIndex
                ? theme.colors.warning
                : day.scheduled > 0
                  ? theme.colors.success
                  : theme.colors.primary;
            return (
              <View key={day.date} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(h, 1), backgroundColor: color },
                    negative ? { top: zeroFromTop } : { top: zeroFromTop - Math.max(h, 1) },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.axisRow}>
          <Text style={styles.axisLabel}>{fmtDay(forecast.days[0].date)}</Text>
          <Text style={styles.axisLabel}>{fmtDay(forecast.days[Math.floor(forecast.days.length / 2)].date)}</Text>
          <Text style={styles.axisLabel}>{fmtDay(forecast.days[forecast.days.length - 1].date)}</Text>
        </View>

        {forecast.walletBalanceUnset && (
          <View style={styles.unsetBox}>
            <Text style={styles.unsetText}>{t('safeToSpend.walletUnset')}</Text>
            <TouchableOpacity onPress={() => router.push('/wallet/set-balance')} accessibilityRole="button">
              <Text style={styles.unsetLink}>{t('safeToSpend.setBalance')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {forecast.events.length > 0 && (
          <View style={styles.events}>
            <Text style={styles.eventsTitle}>{t('analytics.forecastUpcoming')}</Text>
            {forecast.events.slice(0, MAX_EVENTS).map((e, i) => (
              <View key={`${e.date}-${e.kind}-${i}`} style={styles.eventRow}>
                <Text style={styles.eventDate}>{fmtDay(e.date)}</Text>
                <Ionicons
                  name={EVENT_ICON[e.kind]}
                  size={16}
                  color={e.amount > 0 ? theme.colors.success : theme.colors.textSecondary}
                />
                <Text style={styles.eventLabel} numberOfLines={1}>
                  {e.label || t(`analytics.forecastKind_${e.kind}`)}
                </Text>
                <Text style={[styles.eventAmount, e.amount > 0 && { color: theme.colors.success }]}>
                  {e.amount > 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(e.amount), currency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.note}>
          {forecast.spendingHistoryShort
            ? t('analytics.forecastNoteShortHistory')
            : t('analytics.forecastNote', { amount: formatCurrency(forecast.typicalDailySpend, currency) })}
          {forecast.fxApproximate ? ` ${t('analytics.forecastNoteFx')}` : ''}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  headlineRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  headline: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  stat: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  statValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  chart: {
    flexDirection: 'row' as const,
    marginTop: theme.spacing[4],
    position: 'relative' as const,
  },
  zeroLine: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  barSlot: {
    flex: 1,
    height: '100%' as const,
    marginHorizontal: 1,
  },
  bar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    borderRadius: 2,
  },
  axisRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: theme.spacing[1],
  },
  axisLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  unsetBox: {
    marginTop: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.warningLight,
    gap: theme.spacing[1],
  },
  unsetText: {
    ...theme.textStyles.caption,
    color: theme.colors.textPrimary,
  },
  unsetLink: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  events: {
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  eventsTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  eventRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  eventDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    width: 56,
  },
  eventLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  eventAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  note: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
  },
});
