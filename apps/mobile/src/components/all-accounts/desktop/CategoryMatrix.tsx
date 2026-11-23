import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAccountRow, AllAccountsCategoryRow } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { accountColor } from '@/features/all-accounts/allAccountsDisplay';
import { categoryRowName } from '@/features/all-accounts/categoryLabel';

const NAME_WIDTH = 200;
const CELL_WIDTH = 120;

interface Props {
  rows: AllAccountsCategoryRow[];
  accounts: AllAccountsAccountRow[];
  currency: string;
  type: 'expense' | 'income';
}

/**
 * Category x account matrix: one column per counted account plus a total. Excluded and encrypted accounts have
 * no column (they carry no figures, and a column of zeros would claim they spent nothing). A cell with no
 * amount for that account shows a dash. The grid scrolls horizontally when there are many accounts.
 */
export function CategoryMatrix({ rows, accounts, currency, type }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const columns = accounts
    .map((account, index) => ({ account, index }))
    .filter((c) => c.account.included && !c.account.encrypted);

  if (rows.length === 0) return <Text style={styles.sub}>{t('allAccounts.noData')}</Text>;

  return (
    <ScrollView horizontal>
      <View style={{ minWidth: NAME_WIDTH + (columns.length + 1) * CELL_WIDTH }}>
        <View style={styles.headRow}>
          <View style={styles.nameCell} />
          {columns.map(({ account, index }) => (
            <View key={account.id} style={[styles.cell, styles.headCell]}>
              <View style={[styles.dot, { backgroundColor: accountColor(index, theme.colors) }]} />
              <Text style={styles.headText} numberOfLines={1}>
                {account.name}
              </Text>
            </View>
          ))}
          <Text style={[styles.cell, styles.headText, styles.right]}>{t('common.total')}</Text>
        </View>
        {rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={[styles.nameCell, styles.name]} numberOfLines={1}>
              {categoryRowName(r, t('allAccounts.other'), type)}
            </Text>
            {columns.map(({ account }) => {
              const v = r.perAccount[account.id];
              return (
                <Text
                  key={account.id}
                  style={[styles.cell, styles.num, styles.right, v === undefined && styles.sub]}
                >
                  {v === undefined ? '—' : formatCurrency(v, currency)}
                </Text>
              );
            })}
            <Text style={[styles.cell, styles.num, styles.right, styles.total]}>
              {formatCurrency(r.total, currency)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  headRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingVertical: theme.spacing[2],
  },
  nameCell: { width: NAME_WIDTH, paddingRight: theme.spacing[2] },
  cell: { width: CELL_WIDTH, paddingHorizontal: theme.spacing[1] },
  headCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    justifyContent: 'flex-end' as const,
  },
  right: { textAlign: 'right' as const },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headText: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  num: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  total: { fontWeight: '700' as const },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
});
