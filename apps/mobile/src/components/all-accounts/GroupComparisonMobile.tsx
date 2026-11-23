import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAnalyticsResponse } from '@budget/shared-types';
import type { GroupScreen } from '@/features/all-accounts/useGroupScreen';
import { accountColor } from '@/features/all-accounts/allAccountsDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { PeriodPicker } from './PeriodPicker';
import { TotalsTiles } from './TotalsTiles';
import { GroupEditorSheet } from './GroupEditorSheet';
import { openAccountAnalytics } from './AllAccountsMobile';

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(
    new Date(y, m - 1, 1)
  );
}

/** One group: per-account income / costs / result, group totals, per-month result bars, edit and delete. */
export function GroupComparisonMobile({
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
  const results = data.months.map((m) =>
    Object.values(m.perAccount).reduce((s, v) => s + v.income - v.spent, 0)
  );
  const maxAbs = Math.max(1, ...results.map(Math.abs));

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <PeriodPicker
        preset={state.preset}
        onPreset={state.setPreset}
        range={state.range}
        onCustom={state.setCustom}
      />
      <TotalsTiles totals={data.totals} currency={cur} />
      {state.loading && <ActivityIndicator color={theme.colors.primary} />}
      {data.fxApproximate && <Text style={styles.muted}>{t('allAccounts.fxApproximate')}</Text>}

      <View style={styles.card}>
        {data.accounts.map((a, i) => {
          const counted = a.included && !a.encrypted;
          return (
            <TouchableOpacity
              key={a.id}
              style={styles.accRow}
              onPress={counted ? () => void openAccountAnalytics(a.id) : undefined}
              activeOpacity={counted ? 0.7 : 1}
            >
              <View style={styles.accHead}>
                <View style={[styles.dot, { backgroundColor: accountColor(i, theme.colors) }]} />
                <Text style={styles.name} numberOfLines={1}>
                  {a.name}
                </Text>
              </View>
              {counted ? (
                <View style={styles.figures}>
                  <Text
                    style={styles.fig}
                  >{`${t('allAccounts.group.rent')}: ${formatCurrency(a.income, cur)}`}</Text>
                  <Text
                    style={styles.fig}
                  >{`${t('allAccounts.group.costs')}: ${formatCurrency(a.spent, cur)}`}</Text>
                  <Text
                    style={[
                      styles.fig,
                      { color: a.net < 0 ? theme.colors.danger : theme.colors.success },
                    ]}
                  >
                    {`${t('allAccounts.group.result')}: ${formatCurrency(a.net, cur)}`}
                  </Text>
                </View>
              ) : (
                <Text style={styles.muted}>
                  {a.encrypted ? t('allAccounts.encryptedNotIncluded') : t('netWorth.excluded')}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {data.months.length > 0 && (
        <View style={styles.card}>
          <Text
            style={styles.title}
          >{`${t('allAccounts.group.result')} · ${t('allAccounts.byMonth')}`}</Text>
          {data.months.map((m, i) => (
            <View key={m.month} style={styles.monthRow}>
              <Text style={styles.monthLabel}>{monthLabel(m.month, locale)}</Text>
              <View style={styles.track}>
                <View
                  style={{
                    height: 8,
                    borderRadius: 4,
                    width: `${Math.round((Math.abs(results[i]) / maxAbs) * 100)}%`,
                    backgroundColor: results[i] < 0 ? theme.colors.danger : theme.colors.success,
                  }}
                />
              </View>
              <Text style={styles.monthValue}>{formatCurrency(results[i], cur)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        {group && (
          <TouchableOpacity onPress={() => setEditing(true)} accessibilityRole="button">
            <Text style={styles.link}>{t('allAccounts.groups.edit')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={confirmDelete} accessibilityRole="button">
          <Text style={[styles.link, { color: theme.colors.danger }]}>
            {t('allAccounts.groups.delete')}
          </Text>
        </TouchableOpacity>
      </View>

      <GroupEditorSheet
        visible={editing}
        group={group}
        onClose={() => setEditing(false)}
        onSave={saveGroup}
      />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10], gap: theme.spacing[3] },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  accRow: {
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    gap: 4,
  },
  accHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  figures: { gap: 2 },
  fig: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums' as const],
  },
  monthRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: 3,
  },
  monthLabel: { width: 62, ...theme.textStyles.caption, color: theme.colors.textTertiary },
  track: { flex: 1, height: 8 },
  monthValue: {
    minWidth: 90,
    textAlign: 'right' as const,
    ...theme.textStyles.caption,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  actions: { flexDirection: 'row' as const, justifyContent: 'space-around' as const },
});
