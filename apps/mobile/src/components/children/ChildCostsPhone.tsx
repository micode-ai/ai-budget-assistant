import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { ChildCostsState } from '@/features/children/useChildCosts';
import { childCategoryRows, isEmptySummary } from '@/features/children/childCostsDisplay';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  amountOrDash,
  ChildCostsActions,
  ChildCostsStatus,
  ChildHeading,
  FxNotice,
  MonthBars,
} from './ChildCostsParts';

export interface ChildCostsLayoutProps {
  /** From `useChildCosts`, called once in `ChildCostsView` above the 1024 split. */
  costs: ChildCostsState;
  onShare: () => void;
  /** Statement PDF: the paywall for a free user, else the statement dialog. */
  onStatement: () => void;
  /** On Pro or Business — the Statement PDF button then shows no badge. */
  statementPro: boolean;
}

/**
 * The phone (and narrow web) Child costs screen: stacked cards — the three
 * totals, the 800+ coverage line, the 12-month bars, this year's categories
 * and the actions. Presentational; every number arrives in `costs`.
 */
export function ChildCostsPhone({ costs, onShare, onStatement, statementPro }: ChildCostsLayoutProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const categories = useCategoryStore((s) => s.categories);
  const { summary, coverage, child, currency } = costs;

  let body: React.ReactNode;
  if (costs.error) body = <ChildCostsStatus kind="error" onRetry={costs.retry} />;
  else if (costs.loading) body = <ChildCostsStatus kind="loading" />;
  else if (!child || !summary) body = <ChildCostsStatus kind="notFound" />;
  else {
    const empty = isEmptySummary(summary);
    const rows = childCategoryRows(summary, categories);
    body = (
      <>
        <ChildHeading child={child} />

        <View style={styles.tiles}>
          <Tile label={t('childCosts.thisMonth')} value={amountOrDash(summary.monthTotal, currency, empty)} />
          <Tile label={t('childCosts.thisYear')} value={amountOrDash(summary.yearTotal, currency, empty)} />
          <Tile label={t('childCosts.averagePerMonth')} value={amountOrDash(summary.averagePerMonth, currency, empty)} />
        </View>

        {coverage && (
          <View style={styles.card}>
            <Text style={styles.coverageText}>
              {coverage.percent !== null
                ? t('childCosts.coverageLine', { percent: coverage.percent })
                : t('childCosts.coverageNoSpending', { amount: formatCurrency(coverage.benefit, currency) })}
            </Text>
          </View>
        )}

        {summary.fxApproximate && <FxNotice />}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('childCosts.last12Months')}</Text>
          <MonthBars summary={summary} currency={currency} empty={empty} />
        </View>

        {rows.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('childCosts.byCategory')}</Text>
            {rows.map((r, i) => (
              <View key={r.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={styles.rowInfo}>
                  <View style={[styles.dot, r.color ? { backgroundColor: r.color } : styles.dotFallback]} />
                  <Text style={styles.rowName} numberOfLines={1}>{r.name}</Text>
                </View>
                <Text style={styles.rowAmount}>{formatCurrency(r.amount, currency)}</Text>
              </View>
            ))}
          </View>
        )}

        <ChildCostsActions
          onShare={onShare}
          shareDisabled={empty}
          onStatement={onStatement}
          statementPro={statementPro}
        />
      </>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[8] + insets.bottom }]}
    >
      {body}
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[8], gap: theme.spacing[4] },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  tile: {
    flexBasis: '30%' as const,
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  tileLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[1] },
  tileValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  coverageText: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[2.5],
    gap: theme.spacing[3],
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  rowInfo: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2], flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotFallback: { backgroundColor: theme.colors.textTertiary },
  rowName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flexShrink: 1 },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
});
