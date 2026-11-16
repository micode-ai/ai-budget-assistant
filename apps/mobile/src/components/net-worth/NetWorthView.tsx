import { View, Text, ScrollView, Switch, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { NetWorthParts } from '@budget/shared-types';
import { useNetWorth } from '@/features/net-worth/useNetWorth';
import { changeSince, isEmptyHistory } from '@/features/net-worth/netWorthDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

const CHART_HEIGHT = 120;

/** `YYYY-MM` → short month name in the user's locale. */
function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1));
}

/**
 * Net worth across every account the user belongs to (ABA-799): the figure,
 * its change over a month and a year, its four parts, the last 12 month-ends,
 * and a switch per account. One component for phone and desktop — on a wide
 * window it keeps a readable column instead of stretching. The figure comes
 * from `GET /net-worth`; a failed load shows a retry, never a zero.
 */
export function NetWorthView() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();
  const { data, failed, loading, reload, toggleAccount } = useNetWorth();

  if (!data) {
    return (
      <View style={styles.center}>
        {failed ? (
          <>
            <Text style={styles.muted}>{t('netWorth.loadFailed')}</Text>
            <TouchableOpacity onPress={() => void reload()} accessibilityRole="button">
              <Text style={styles.link}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={theme.colors.primary} />
        )}
      </View>
    );
  }

  const currency = data.currencyCode;
  const money = (v: number) => formatCurrency(v, currency);
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), currency)}`;
  const month = changeSince(data.history, 1);
  const year = changeSince(data.history, data.history.length - 1);
  const empty = isEmptyHistory(data.history);
  const approximate = data.history.some((h) => h.approximate);

  const nets = data.history.map((h) => h.net);
  const max = Math.max(0, ...nets);
  const min = Math.min(0, ...nets);
  const span = max - min || 1;
  const zeroFromTop = (max / span) * CHART_HEIGHT;

  const parts: { key: keyof NetWorthParts; label: string; sign: 1 | -1 }[] = [
    { key: 'cash', label: t('netWorth.cash'), sign: 1 },
    { key: 'investments', label: t('netWorth.investments'), sign: 1 },
    { key: 'owedToMe', label: t('netWorth.owedToMe'), sign: 1 },
    { key: 'debts', label: t('netWorth.debts'), sign: -1 },
  ];

  const changeRow = (label: string, c: ReturnType<typeof changeSince>) =>
    c && (
      <View style={styles.changeRow}>
        <Text style={styles.changeLabel}>{label}</Text>
        <Text
          style={[
            styles.changeValue,
            { color: c.amount > 0 ? theme.colors.success : c.amount < 0 ? theme.colors.danger : theme.colors.textSecondary },
          ]}
        >
          {signed(c.amount)}
          {c.percent !== null ? ` (${c.percent > 0 ? '+' : ''}${c.percent}%)` : ''}
        </Text>
      </View>
    );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <View style={styles.card}>
          <Text style={styles.heroLabel}>{t('netWorth.title')}</Text>
          <Text style={[styles.heroValue, data.current.net < 0 && { color: theme.colors.danger }]}>
            {money(data.current.net)}
          </Text>
          <Text style={styles.muted}>{t('netWorth.subtitle')}</Text>
          {!empty && changeRow(t('netWorth.vsLastMonth'), month)}
          {!empty && changeRow(t('netWorth.vsYearAgo'), year)}
          {loading && <ActivityIndicator color={theme.colors.primary} style={styles.inlineSpinner} />}
        </View>

        <View style={styles.partsGrid}>
          {parts.map((p) => (
            <View key={p.key} style={styles.partCard}>
              <Text style={styles.partLabel}>{p.label}</Text>
              <Text style={[styles.partValue, p.sign < 0 && data.current[p.key] > 0 && { color: theme.colors.danger }]}>
                {p.sign < 0 && data.current[p.key] > 0 ? '−' : ''}
                {money(data.current[p.key])}
              </Text>
            </View>
          ))}
        </View>

        {!empty && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('netWorth.history')}</Text>
            <View style={[styles.chart, { height: CHART_HEIGHT }]}>
              <View style={[styles.zeroLine, { top: zeroFromTop }]} />
              {data.history.map((h) => {
                const height = Math.max(1, (Math.abs(h.net) / span) * CHART_HEIGHT);
                const negative = h.net < 0;
                return (
                  <View key={h.month} style={styles.barSlot}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height,
                          backgroundColor: negative ? theme.colors.danger : theme.colors.primary,
                          opacity: h.approximate ? 0.5 : 1,
                        },
                        negative ? { top: zeroFromTop } : { top: zeroFromTop - height },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
            <View style={styles.axisRow}>
              {data.history.map((h, i) => (
                <Text key={h.month} style={styles.axisLabel}>
                  {i % 2 === data.history.length % 2 ? monthLabel(h.month, locale) : ''}
                </Text>
              ))}
            </View>
            {(approximate || data.fxApproximate) && (
              <Text style={styles.note}>
                {[approximate ? t('netWorth.approximate') : '', data.fxApproximate ? t('netWorth.fxApproximate') : '']
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('netWorth.accounts')}</Text>
          <Text style={styles.muted}>{t('netWorth.accountsHint')}</Text>
          {data.accounts.map((a) => (
            <View key={a.id} style={styles.accountRow}>
              <View style={styles.accountText}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={styles.muted}>
                  {a.encrypted ? t('netWorth.encrypted') : a.net !== null ? money(a.net) : t('netWorth.excluded')}
                </Text>
              </View>
              <Switch
                value={a.included && !a.encrypted}
                disabled={a.encrypted || loading}
                onValueChange={(v) => toggleAccount(a.id, v)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                accessibilityLabel={a.name}
              />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  column: { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const, gap: theme.spacing[4] },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: theme.spacing[2] },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  heroLabel: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  heroValue: {
    ...theme.textStyles.h1,
    fontWeight: '800' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
    marginVertical: theme.spacing[1],
  },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  inlineSpinner: { marginTop: theme.spacing[2], alignSelf: 'flex-start' as const },
  changeRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: theme.spacing[2] },
  changeLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  changeValue: { ...theme.textStyles.bodySm, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
  partsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[3] },
  partCard: {
    flexGrow: 1,
    flexBasis: '45%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  partLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  partValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  sectionTitle: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary, marginBottom: theme.spacing[1] },
  chart: { flexDirection: 'row' as const, marginTop: theme.spacing[3], position: 'relative' as const },
  zeroLine: { position: 'absolute' as const, left: 0, right: 0, height: 1, backgroundColor: theme.colors.divider },
  barSlot: { flex: 1, height: '100%' as const, marginHorizontal: 3 },
  bar: { position: 'absolute' as const, left: 0, right: 0, borderRadius: 3 },
  axisRow: { flexDirection: 'row' as const, marginTop: theme.spacing[1] },
  axisLabel: { flex: 1, textAlign: 'center' as const, ...theme.textStyles.caption, fontSize: 10, color: theme.colors.textTertiary },
  note: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[2] },
  accountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    marginTop: theme.spacing[2],
  },
  accountText: { flex: 1, minWidth: 0 },
  accountName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
});
