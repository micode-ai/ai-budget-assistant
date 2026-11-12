import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { SummaryTile } from '@/components/analytics/desktop/SummaryTile';
import { BreakdownCard } from '@/components/analytics/desktop/BreakdownCard';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { childCategoryRows, isEmptySummary } from '@/features/children/childCostsDisplay';
import { useCategoryStore } from '@/stores/categoryStore';
import { useStyles, type Theme } from '@/theme';
import {
  amountOrDash,
  ChildCostsActions,
  ChildCostsStatus,
  ChildHeading,
  FxNotice,
  MonthBars,
} from '../ChildCostsParts';
import type { ChildCostsLayoutProps } from '../ChildCostsPhone';

/** The rail's width beside the focus column (the dashboard pattern). */
const RAIL_WIDTH = 300;

/**
 * Child costs at >= 1024 (task-7 desktop spec): a header row with the
 * "Children" breadcrumb, the name and the actions; four tiles (the fourth,
 * 800+ coverage, only with benefit income); the approximate notice; then the
 * 12-month bars as the focus column beside a ~300px category rail. Below 1440
 * the rail drops under the focus column and the tiles wrap 2x2 (`SummaryTile`'s
 * own flex basis). One page scroll; no shortcuts are added.
 *
 * Presentational: `costs` comes from `ChildCostsView`, which calls
 * `useChildCosts` above the width split.
 */
export function ChildCostsDesktop({ costs, onShare, onStatement, statementPro }: ChildCostsLayoutProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const categories = useCategoryStore((s) => s.categories);
  const sideBySide = width >= FACET_RAIL_MIN_WIDTH;
  const { summary, coverage, child, currency } = costs;

  const breadcrumb = <Breadcrumb />;

  if (costs.error || costs.loading || !child || !summary) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
        {breadcrumb}
        {costs.loading && !costs.error ? (
          <View style={styles.tiles}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonTile} accessibilityElementsHidden />
            ))}
          </View>
        ) : null}
        <ChildCostsStatus
          kind={costs.error ? 'error' : costs.loading ? 'loading' : 'notFound'}
          onRetry={costs.retry}
        />
      </ScrollView>
    );
  }

  const empty = isEmptySummary(summary);
  const rows = childCategoryRows(summary, categories);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      {breadcrumb}
      <View style={styles.headerRow}>
        <ChildHeading child={child} large />
        <ChildCostsActions
          onShare={onShare}
          shareDisabled={empty}
          onStatement={onStatement}
          statementPro={statementPro}
        />
      </View>

      <View style={styles.tiles}>
        <SummaryTile label={t('childCosts.thisMonth')}>
          <Text style={styles.tileValue}>{amountOrDash(summary.monthTotal, currency, empty)}</Text>
        </SummaryTile>
        <SummaryTile label={t('childCosts.thisYear')}>
          <Text style={styles.tileValue}>{amountOrDash(summary.yearTotal, currency, empty)}</Text>
        </SummaryTile>
        <SummaryTile label={t('childCosts.averagePerMonth')}>
          <Text style={styles.tileValue}>{amountOrDash(summary.averagePerMonth, currency, empty)}</Text>
        </SummaryTile>
        {coverage && (
          <SummaryTile label={t('childCosts.coverageTile')}>
            <Text style={styles.tileValue}>
              {coverage.percent !== null ? `${coverage.percent}%` : '—'}
            </Text>
            <Text style={styles.tileSub}>
              {coverage.percent !== null
                ? t('childCosts.coverageTileSub')
                : t('childCosts.coverageNoSpending', { amount: formatCurrency(coverage.benefit, currency) })}
            </Text>
          </SummaryTile>
        )}
      </View>

      {summary.fxApproximate && <FxNotice />}

      <View style={[styles.columns, !sideBySide && styles.columnsStacked]}>
        <View style={[styles.card, styles.focus]}>
          <Text style={styles.cardTitle}>{t('childCosts.last12Months')}</Text>
          <MonthBars summary={summary} currency={currency} empty={empty} />
        </View>
        <View style={sideBySide ? styles.rail : undefined}>
          <BreakdownCard
            title={t('childCosts.byCategory')}
            rows={rows}
            currency={currency}
            size="secondary"
          />
        </View>
      </View>
    </ScrollView>
  );
}

function Breadcrumb() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={() => router.push('/children')}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      style={styles.breadcrumb}
    >
      <Text style={[styles.breadcrumbText, hovered && styles.breadcrumbHover]}>{t('children.title')}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  page: { padding: theme.spacing[6], gap: theme.spacing[4] },
  breadcrumb: { alignSelf: 'flex-start' as const },
  breadcrumbText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  breadcrumbHover: { textDecorationLine: 'underline' as const },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[4] },
  skeletonTile: {
    flexBasis: '23%' as const,
    flexGrow: 1,
    minWidth: 200,
    height: 84,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  tileValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  tileSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[1] },
  columns: { flexDirection: 'row' as const, gap: theme.spacing[4], alignItems: 'flex-start' as const },
  columnsStacked: { flexDirection: 'column' as const, alignItems: 'stretch' as const },
  focus: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  rail: { width: RAIL_WIDTH, flexShrink: 0 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
});
