import { Text, View } from 'react-native';
import type { AllAccountsAccountRow, AllAccountsMonth } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { accountColor } from '@/features/all-accounts/allAccountsDisplay';

const HEIGHT = 120;

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1));
}

/** Spending per month, one stacked segment per account. Plain Views: no chart-height traps, no extra dependency. */
export function MonthlyStackedChart({
  months,
  accounts,
}: {
  months: AllAccountsMonth[];
  accounts: AllAccountsAccountRow[];
}) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();
  const colorOf = new Map(accounts.map((a, i) => [a.id, accountColor(i, theme.colors)]));
  const totals = months.map((m) => Object.values(m.perAccount).reduce((s, v) => s + v.spent, 0));
  const max = Math.max(1, ...totals);

  return (
    <View>
      <View style={[styles.chart, { height: HEIGHT }]}>
        {months.map((m, mi) => (
          <View key={m.month} style={styles.slot}>
            <View
              style={{ height: (totals[mi] / max) * HEIGHT, overflow: 'hidden', borderRadius: 3 }}
            >
              {Object.entries(m.perAccount)
                .filter(([, v]) => v.spent > 0)
                .map(([id, v]) => (
                  <View
                    key={id}
                    style={{
                      flex: v.spent,
                      backgroundColor: colorOf.get(id) ?? theme.colors.primary,
                    }}
                  />
                ))}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {months.map((m, i) => (
          <Text key={m.month} style={styles.label}>
            {months.length <= 12 || i % 2 === 0 ? monthLabel(m.month, locale) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  chart: { flexDirection: 'row' as const, alignItems: 'flex-end' as const },
  slot: { flex: 1, marginHorizontal: 2, justifyContent: 'flex-end' as const },
  axis: { flexDirection: 'row' as const, marginTop: theme.spacing[1] },
  label: {
    flex: 1,
    textAlign: 'center' as const,
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});
