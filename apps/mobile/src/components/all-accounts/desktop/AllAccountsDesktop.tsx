import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAnalyticsResponse } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { startNewGroup } from '@/features/all-accounts/newGroupGate';
import type { AccountGroupsState, AllAccountsState } from '@/features/all-accounts/types';
import { SummaryTile } from '@/components/analytics/desktop/SummaryTile';
import { PeriodPicker } from '../PeriodPicker';
import { GroupStrip } from '../GroupStrip';
import { GroupEditorSheet } from '../GroupEditorSheet';
import { MonthlyStackedChart } from '../MonthlyStackedChart';
import { openAccountAnalytics } from '../AllAccountsMobile';
import { AccountTable } from './AccountTable';
import { CategoryMatrix } from './CategoryMatrix';

interface Props {
  state: AllAccountsState;
  data: AllAccountsAnalyticsResponse;
  groups: AccountGroupsState;
}

/**
 * Desktop all-accounts overview (>= 1024). One page scroll: period + group tabs, a totals strip, the sortable
 * account table beside the monthly chart, then the category x account matrices. No new data path: everything
 * arrives as props from `AllAccountsView.web.tsx`, which owns the hooks.
 */
export function AllAccountsDesktop({ state, data, groups }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [editorOpen, setEditorOpen] = useState(false);
  const cur = data.currencyCode;
  const { totals } = data;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.controls}>
          <PeriodPicker
            preset={state.preset}
            onPreset={state.setPreset}
            range={state.range}
            onCustom={state.setCustom}
          />
          <GroupStrip
            groups={groups.groups}
            onNew={() => void startNewGroup(t, () => setEditorOpen(true))}
          />
        </View>
        {groups.failed && (
          <TouchableOpacity onPress={() => void groups.reload()} accessibilityRole="button">
            <Text
              style={styles.muted}
            >{`${t('allAccounts.loadFailed')} ${t('common.retry')}`}</Text>
          </TouchableOpacity>
        )}

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

        <View style={styles.split}>
          <View style={[styles.card, styles.tableCard]}>
            <AccountTable
              accounts={data.accounts}
              currency={cur}
              loading={state.loading}
              canToggle
              onToggle={state.toggleAccount}
              onOpen={(id) => void openAccountAnalytics(id)}
            />
          </View>
          {data.months.length > 0 && (
            <View style={[styles.card, styles.chartCard]}>
              <Text style={styles.title}>{t('allAccounts.byMonth')}</Text>
              <MonthlyStackedChart months={data.months} accounts={data.accounts} />
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('allAccounts.categories')}</Text>
          <CategoryMatrix
            rows={data.expenseCategories}
            accounts={data.accounts}
            currency={cur}
            type="expense"
          />
        </View>
        {data.incomeCategories.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>{t('allAccounts.incomeCategories')}</Text>
            <CategoryMatrix
              rows={data.incomeCategories}
              accounts={data.accounts}
              currency={cur}
              type="income"
            />
          </View>
        )}
      </ScrollView>

      <GroupEditorSheet
        centered
        visible={editorOpen}
        group={null}
        onClose={() => setEditorOpen(false)}
        onSave={(dto) => groups.create(dto)}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Must paint its own ground: a transparent tree shows React Navigation's light default through it.
  root: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  body: { padding: theme.spacing[5], paddingBottom: theme.spacing[8], gap: theme.spacing[5] },
  controls: { gap: theme.spacing[3] },
  strip: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[3] },
  value: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  split: {
    flexDirection: 'row' as const,
    gap: theme.spacing[5],
    alignItems: 'flex-start' as const,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  tableCard: { flex: 3, minWidth: 0 },
  chartCard: { flex: 2, minWidth: 0 },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
});
