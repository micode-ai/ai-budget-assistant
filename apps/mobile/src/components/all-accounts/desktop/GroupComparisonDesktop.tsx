import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAnalyticsResponse } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { accountColor } from '@/features/all-accounts/allAccountsDisplay';
import type { GroupScreen } from '@/features/all-accounts/useGroupScreen';
import { SummaryTile } from '@/components/analytics/desktop/SummaryTile';
import { PeriodPicker } from '../PeriodPicker';
import { GroupEditorSheet } from '../GroupEditorSheet';
import { openAccountAnalytics } from '../AllAccountsMobile';

const NAME_WIDTH = 200;
const FIGURE_WIDTH = 120;
const MONTH_WIDTH = 104;

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(
    new Date(y, m - 1, 1)
  );
}

/**
 * Desktop group comparison: totals strip, then ONE wide table, a row per account and a column per month (the
 * result, income minus costs), led by the period's income / costs / result. A footer row sums the group. The
 * hook lives in `GroupComparisonView.web.tsx`; this only prints what it is given.
 */
export function GroupComparisonDesktop({
  screen,
  data,
}: {
  screen: GroupScreen;
  data: AllAccountsAnalyticsResponse;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();
  const { state, group, editing, setEditing, confirmDelete, saveGroup } = screen;
  const cur = data.currencyCode;
  const { totals } = data;
  const tableWidth = NAME_WIDTH + 3 * FIGURE_WIDTH + data.months.length * MONTH_WIDTH;

  const resultOf = (month: (typeof data.months)[number], id: string): number | null => {
    const v = month.perAccount[id];
    return v ? v.income - v.spent : null;
  };
  const tint = (n: number) => (n < 0 ? theme.colors.danger : theme.colors.success);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.headRow}>
          <PeriodPicker
            preset={state.preset}
            onPreset={state.setPreset}
            range={state.range}
            onCustom={state.setCustom}
          />
          <View style={styles.actions}>
            {group && (
              <Pressable onPress={() => setEditing(true)} accessibilityRole="button">
                <Text style={styles.link}>{t('allAccounts.groups.edit')}</Text>
              </Pressable>
            )}
            <Pressable onPress={confirmDelete} accessibilityRole="button">
              <Text style={[styles.link, { color: theme.colors.danger }]}>
                {t('allAccounts.groups.delete')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.strip}>
          <SummaryTile label={t('allAccounts.spent')}>
            <Text style={styles.value}>{formatCurrency(totals.spent, cur)}</Text>
          </SummaryTile>
          <SummaryTile label={t('allAccounts.income')}>
            <Text style={[styles.value, { color: theme.colors.success }]}>
              {formatCurrency(totals.income, cur)}
            </Text>
          </SummaryTile>
          <SummaryTile label={t('allAccounts.net')}>
            <Text style={[styles.value, totals.net < 0 && { color: theme.colors.danger }]}>
              {formatCurrency(totals.net, cur)}
            </Text>
          </SummaryTile>
        </View>
        {state.loading && <ActivityIndicator color={theme.colors.primary} />}
        {data.fxApproximate && <Text style={styles.muted}>{t('allAccounts.fxApproximate')}</Text>}

        <View style={styles.card}>
          <ScrollView horizontal>
            <View style={{ minWidth: tableWidth }}>
              <View style={styles.row}>
                <Text style={[styles.nameCell, styles.headText]}>{t('allAccounts.accounts')}</Text>
                <Text style={[styles.figCell, styles.headText]}>{t('allAccounts.group.rent')}</Text>
                <Text style={[styles.figCell, styles.headText]}>
                  {t('allAccounts.group.costs')}
                </Text>
                <Text style={[styles.figCell, styles.headText]}>
                  {t('allAccounts.group.result')}
                </Text>
                {data.months.map((m) => (
                  <Text key={m.month} style={[styles.monthCell, styles.headText]}>
                    {monthLabel(m.month, locale)}
                  </Text>
                ))}
              </View>
              {data.accounts.map((a, i) => {
                const counted = a.included && !a.encrypted;
                return (
                  <Pressable
                    key={a.id}
                    style={[styles.row, styles.bodyRow]}
                    onPress={counted ? () => void openAccountAnalytics(a.id) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={a.name}
                  >
                    <View style={[styles.nameCell, styles.nameInner]}>
                      <View
                        style={[styles.dot, { backgroundColor: accountColor(i, theme.colors) }]}
                      />
                      <Text style={styles.name} numberOfLines={1}>
                        {a.name}
                      </Text>
                    </View>
                    {counted ? (
                      <>
                        <Text style={[styles.figCell, styles.num]}>
                          {formatCurrency(a.income, cur)}
                        </Text>
                        <Text style={[styles.figCell, styles.num]}>
                          {formatCurrency(a.spent, cur)}
                        </Text>
                        <Text style={[styles.figCell, styles.num, { color: tint(a.net) }]}>
                          {formatCurrency(a.net, cur)}
                        </Text>
                        {data.months.map((m) => {
                          const r = resultOf(m, a.id);
                          return (
                            <Text
                              key={m.month}
                              style={[
                                styles.monthCell,
                                styles.num,
                                r === null ? styles.muted : { color: tint(r) },
                              ]}
                            >
                              {r === null ? '—' : formatCurrency(r, cur)}
                            </Text>
                          );
                        })}
                      </>
                    ) : (
                      <Text style={styles.muted}>
                        {a.encrypted
                          ? t('allAccounts.encryptedNotIncluded')
                          : t('netWorth.excluded')}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              <View style={[styles.row, styles.bodyRow, styles.footRow]}>
                <Text style={[styles.nameCell, styles.name, styles.bold]}>{t('common.total')}</Text>
                <Text style={[styles.figCell, styles.num, styles.bold]}>
                  {formatCurrency(totals.income, cur)}
                </Text>
                <Text style={[styles.figCell, styles.num, styles.bold]}>
                  {formatCurrency(totals.spent, cur)}
                </Text>
                <Text
                  style={[styles.figCell, styles.num, styles.bold, { color: tint(totals.net) }]}
                >
                  {formatCurrency(totals.net, cur)}
                </Text>
                {data.months.map((m) => {
                  const sum = Object.values(m.perAccount).reduce(
                    (s, v) => s + v.income - v.spent,
                    0
                  );
                  return (
                    <Text
                      key={m.month}
                      style={[styles.monthCell, styles.num, styles.bold, { color: tint(sum) }]}
                    >
                      {formatCurrency(sum, cur)}
                    </Text>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      <GroupEditorSheet
        centered
        visible={editing}
        group={group}
        onClose={() => setEditing(false)}
        onSave={saveGroup}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Must paint its own ground: a transparent tree shows React Navigation's light default through it.
  root: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  body: { padding: theme.spacing[5], paddingBottom: theme.spacing[8], gap: theme.spacing[5] },
  headRow: { gap: theme.spacing[3] },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[5] },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  strip: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[3] },
  value: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  bodyRow: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  footRow: { borderTopColor: theme.colors.border },
  nameCell: { width: NAME_WIDTH, paddingRight: theme.spacing[2] },
  nameInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  figCell: {
    width: FIGURE_WIDTH,
    textAlign: 'right' as const,
    paddingHorizontal: theme.spacing[1],
  },
  monthCell: {
    width: MONTH_WIDTH,
    textAlign: 'right' as const,
    paddingHorizontal: theme.spacing[1],
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  headText: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  num: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  bold: { fontWeight: '700' as const },
});
