import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { InteractiveDonutChart } from '@/components/interactive-charts';
import { useStyles, type Theme } from '@/theme';
import type { IncomeCategorySpending } from '@/features/analytics/useAnalytics';
import { drillView } from '@/features/analytics/categoryDrillView';
import { useDrillParent } from '@/features/analytics/useDrillParent';
import { CategoryDrillBreadcrumb } from './CategoryDrillBreadcrumb';

interface Props {
  incomeByCategory: IncomeCategorySpending[];
  currency: string;
}

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

export function IncomeCategoryBreakdown({ incomeByCategory, currency }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { drillParentId, setDrillParentId } = useDrillParent(incomeByCategory);
  const { rows, parent } = drillView(incomeByCategory, drillParentId);
  const drill = (row: IncomeCategorySpending) => {
    if (row.children && row.children.length > 0) setDrillParentId(row.categoryId);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.byIncomeCategory')}</Text>
      <View style={styles.chartContainer}>
        {parent && (
          <CategoryDrillBreadcrumb parentName={parent.name} onBack={() => setDrillParentId(null)} />
        )}
        <InteractiveDonutChart
          key={parent?.categoryId ?? 'top'}
          data={rows.map((c) => ({
            label: c.name,
            value: c.amount,
            color: c.color,
            id: c.categoryId || undefined,
          }))}
          size={160}
          centerLabel={parent ? parent.name : undefined}
          onSectionPress={parent ? undefined : (_item, index) => drill(rows[index])}
          formatValue={formatChartValue}
          showLegend={true}
        />
      </View>
      {rows.map((category, index) => {
        const drillable = !parent && !!category.children && category.children.length > 0;
        const Row = drillable ? TouchableOpacity : View;
        return (
        <Row
          key={`${category.categoryId ?? 'none'}-${index}`}
          style={styles.row}
          {...(drillable ? { onPress: () => drill(category), accessibilityRole: 'button' as const } : {})}
        >
          <View style={styles.rowInfo}>
            <View style={[styles.dot, { backgroundColor: category.color }]} />
            <Text style={styles.rowName}>{category.name}</Text>
            {drillable && <Text style={styles.chevron}>›</Text>}
          </View>
          <View style={styles.rowValues}>
            <Text style={styles.rowAmount}>{formatCurrency(category.amount, currency)}</Text>
            <Text style={styles.rowPercent}>{category.percentage.toFixed(0)}%</Text>
          </View>
        </Row>
        );
      })}
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
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    ...theme.shadows.sm,
  },
  row: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  rowInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flex: 1,
    marginRight: theme.spacing[2],
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: theme.borderRadius.sm,
    flexShrink: 0,
  },
  rowName: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  chevron: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  rowValues: {
    alignItems: 'flex-end' as const,
  },
  rowAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  rowPercent: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
});
