import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStyles, type Theme } from '@/theme';
import type {
  CategorySpending,
  MerchantSpending,
  TagSpending,
  ProjectSpending,
  IncomeCategorySpending,
} from '@/features/analytics/useAnalytics';
import { BreakdownCard, type BreakdownRow } from './BreakdownCard';

function categoryToRows(categorySpending: CategorySpending[]): BreakdownRow[] {
  return categorySpending.map((c, index) => ({
    id: c.categoryId ?? `category-${index}`,
    name: c.name,
    amount: c.amount,
    percentage: c.percentage,
    color: c.color,
    delta: c.vsAverage,
  }));
}

function merchantToRows(merchantSpending: MerchantSpending[]): BreakdownRow[] {
  return merchantSpending.map((m) => ({
    id: m.merchant,
    name: m.merchant,
    amount: m.amount,
    percentage: m.percentage,
    color: m.color,
  }));
}

function tagToRows(tagSpending: TagSpending[]): BreakdownRow[] {
  return tagSpending.map((ts) => ({
    id: ts.tagId,
    name: ts.name,
    amount: ts.amount,
    percentage: ts.percentage,
    color: ts.color,
  }));
}

function projectToRows(projectSpending: ProjectSpending[]): BreakdownRow[] {
  return projectSpending.map((ps) => ({
    id: ps.projectId,
    name: ps.name,
    amount: ps.amount,
    percentage: ps.percentage,
    color: ps.color,
    budget: ps.budget,
  }));
}

function incomeToRows(incomeByCategory: IncomeCategorySpending[]): BreakdownRow[] {
  return incomeByCategory.map((c, index) => ({
    id: c.categoryId ?? `income-${index}`,
    name: c.name,
    amount: c.amount,
    percentage: c.percentage,
    color: c.color,
  }));
}

export interface BreakdownGridProps {
  isWideGrid: boolean;
  currency: string;
  categorySpending: CategorySpending[];
  merchantSpending: MerchantSpending[];
  tagSpending: TagSpending[];
  projectSpending: ProjectSpending[];
  incomeByCategory: IncomeCategorySpending[];
}

/**
 * Two row-groups, each its own `flexWrap` container (kept separate rather
 * than one 5-item wrap so Category's row never silently absorbs a stray
 * secondary tile when Merchant happens to be absent — see the task report
 * for the reasoning). At >=1440 (`isWideGrid`): row A is Category (2 of 3
 * tracks, never collapses, full list) + Merchant (1 of 3, conditional); row B
 * is Tag/Project/Income (each 1 of 3, conditional). Below 1440: Category
 * takes its own row alone at full width, and Merchant joins Tag/Project/
 * Income as a "secondaries" group that pairs two-per-row instead of three —
 * this is the one thing that genuinely reflows between the two width bands
 * (design's "What changes at 1024-1439"). `flexShrink: 1` on every tile
 * wrapper is deliberate: React Native's `View` defaults `flexShrink` to 0
 * (unlike the web default of 1), so without it a `gap`-bearing row whose
 * percentage-based tracks sum to 100% would overflow its container instead
 * of yielding the gap's width back.
 */
export function BreakdownGrid({
  isWideGrid,
  currency,
  categorySpending,
  merchantSpending,
  tagSpending,
  projectSpending,
  incomeByCategory,
}: BreakdownGridProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  const hasMerchant = merchantSpending.length > 0;
  const showMerchantInRowA = isWideGrid && hasMerchant;

  // At the narrow band Merchant moves down to join the secondaries group;
  // at the wide band it stays with Category in row A above.
  const secondaries: { key: string; title: string; rows: BreakdownRow[] }[] = [
    ...(!isWideGrid && hasMerchant ? [{ key: 'merchant', title: t('analytics.byMerchant'), rows: merchantToRows(merchantSpending) }] : []),
    ...(tagSpending.length > 0 ? [{ key: 'tag', title: t('analytics.byTag'), rows: tagToRows(tagSpending) }] : []),
    ...(projectSpending.length > 0 ? [{ key: 'project', title: t('analytics.byProject'), rows: projectToRows(projectSpending) }] : []),
    ...(incomeByCategory.length > 0 ? [{ key: 'income', title: t('analytics.byIncomeCategory'), rows: incomeToRows(incomeByCategory) }] : []),
  ];

  const secondaryBasis = isWideGrid ? '33%' : '50%';

  return (
    <View style={styles.breakdownGrid}>
      <View style={styles.breakdownRow}>
        <View style={[styles.breakdownTile, { flexBasis: isWideGrid ? '66%' : '100%', flexGrow: 1, flexShrink: 1, minWidth: 0 }]}>
          <BreakdownCard title={t('analytics.spendingByCategory')} rows={categoryToRows(categorySpending)} currency={currency} size="primary" />
        </View>
        {showMerchantInRowA && (
          <View style={[styles.breakdownTile, { flexBasis: '33%', flexGrow: 1, flexShrink: 1, minWidth: 0 }]}>
            <BreakdownCard title={t('analytics.byMerchant')} rows={merchantToRows(merchantSpending)} currency={currency} size="secondary" />
          </View>
        )}
      </View>

      {secondaries.length > 0 && (
        <View style={styles.breakdownRow}>
          {secondaries.map((s) => (
            <View key={s.key} style={[styles.breakdownTile, { flexBasis: secondaryBasis, flexGrow: 1, flexShrink: 1, minWidth: 0 }]}>
              <BreakdownCard title={s.title} rows={s.rows} currency={currency} size="secondary" />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  breakdownGrid: {
    gap: theme.spacing[4],
  },
  breakdownRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[4],
  },
  breakdownTile: {
    // flexBasis/flexGrow/flexShrink come from the caller (regime-dependent) —
    // this only carries what's common to every tile in the grid.
  },
});
