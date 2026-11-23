import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AllAccountsAnalyticsResponse } from '@budget/shared-types';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { startNewGroup } from '@/features/all-accounts/newGroupGate';
import type { AccountGroupsState, AllAccountsState } from '@/features/all-accounts/types';
import { PeriodPicker } from './PeriodPicker';
import { TotalsTiles } from './TotalsTiles';
import { AccountRows } from './AccountRows';
import { CategoryRows } from './CategoryRows';
import { MonthlyStackedChart } from './MonthlyStackedChart';
import { GroupStrip } from './GroupStrip';
import { GroupEditorSheet } from './GroupEditorSheet';

interface Props {
  state: AllAccountsState;
  data: AllAccountsAnalyticsResponse;
  groups: AccountGroupsState;
}

type Segment = 'accounts' | 'categories';

/** Switch to the account, then open its Analytics tab. */
export async function openAccountAnalytics(id: string) {
  await useAccountStore.getState().switchAccount(id);
  router.push('/(tabs)/analytics');
}

export function AllAccountsMobile({ state, data, groups }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [segment, setSegment] = useState<Segment>('accounts');
  const [editorOpen, setEditorOpen] = useState(false);

  const onNewGroup = () => startNewGroup(t, () => setEditorOpen(true));

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <PeriodPicker
        preset={state.preset}
        onPreset={state.setPreset}
        range={state.range}
        onCustom={state.setCustom}
      />
      <GroupStrip groups={groups.groups} onNew={() => void onNewGroup()} />
      {groups.failed && (
        <TouchableOpacity onPress={() => void groups.reload()} accessibilityRole="button">
          <Text style={styles.muted}>{`${t('allAccounts.loadFailed')} ${t('common.retry')}`}</Text>
        </TouchableOpacity>
      )}
      <TotalsTiles totals={data.totals} currency={data.currencyCode} />
      {state.loading && <ActivityIndicator color={theme.colors.primary} />}
      {data.fxApproximate && <Text style={styles.muted}>{t('allAccounts.fxApproximate')}</Text>}

      <View style={styles.segments}>
        {(['accounts', 'categories'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.segment, segment === s && styles.segmentActive]}
            onPress={() => setSegment(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === s }}
          >
            <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>
              {s === 'accounts' ? t('allAccounts.accounts') : t('allAccounts.categories')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.card}>
        {segment === 'accounts' ? (
          <AccountRows
            accounts={data.accounts}
            currency={data.currencyCode}
            loading={state.loading}
            canToggle
            onToggle={state.toggleAccount}
            onOpen={(id) => void openAccountAnalytics(id)}
          />
        ) : (
          <>
            <CategoryRows
              rows={data.expenseCategories}
              accounts={data.accounts}
              currency={data.currencyCode}
              type="expense"
            />
            {data.incomeCategories.length > 0 && (
              <>
                <Text style={[styles.title, styles.gap]}>{t('allAccounts.incomeCategories')}</Text>
                <CategoryRows
                  rows={data.incomeCategories}
                  accounts={data.accounts}
                  currency={data.currencyCode}
                  type="income"
                />
              </>
            )}
          </>
        )}
      </View>

      {data.months.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>{t('allAccounts.byMonth')}</Text>
          <MonthlyStackedChart months={data.months} accounts={data.accounts} />
        </View>
      )}

      <GroupEditorSheet
        visible={editorOpen}
        group={null}
        onClose={() => setEditorOpen(false)}
        onSave={(dto) => groups.create(dto)}
      />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10], gap: theme.spacing[3] },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  segments: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  segmentActive: { backgroundColor: theme.colors.primary },
  segmentText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  segmentTextActive: { color: theme.colors.textInverse },
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
  gap: { marginTop: theme.spacing[4] },
});
