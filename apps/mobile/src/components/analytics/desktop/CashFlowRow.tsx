import { View } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { CashFlowCard } from '../CashFlowCard';
import { CommitmentsCard } from '../CommitmentsCard';
import type { CashFlowAnalytics } from '@/features/analytics/useCashFlowAnalytics';

/**
 * Desktop placement of the two cash-flow cards side by side — the same
 * components the phone stacks, so the layout is the only thing duplicated
 * (same precedent as `TrendAndWeekdayRow`).
 */
export function CashFlowRow({ analytics, currency }: { analytics: CashFlowAnalytics; currency: string }) {
  const styles = useStyles(createStyles);
  const { cashFlow, cashFlowMonths, commitments } = analytics;
  const showCommitments = commitments !== null && commitments.fixed + commitments.flexible > 0;
  return (
    <View style={styles.row}>
      <View style={[styles.item, { flex: 3 }]}>
        <CashFlowCard cashFlow={cashFlow} months={cashFlowMonths} currency={currency} />
      </View>
      {showCommitments && (
        <View style={[styles.item, { flex: 2 }]}>
          <CommitmentsCard commitments={commitments} currency={currency} />
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[4],
  },
  item: {
    minWidth: 0,
  },
});
