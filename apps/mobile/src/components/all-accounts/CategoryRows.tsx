import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAccountRow, AllAccountsCategoryRow } from '@budget/shared-types';
import { useStyles, type Theme } from '@/theme';
import { categoryRowName } from '@/features/all-accounts/categoryLabel';

interface Props {
  rows: AllAccountsCategoryRow[];
  accounts: AllAccountsAccountRow[];
  currency: string;
  type: 'expense' | 'income';
}

/** Categories merged across accounts; a row expands to the per-account amounts. */
export function CategoryRows({ rows, accounts, currency, type }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  if (rows.length === 0) return <Text style={styles.sub}>{t('allAccounts.noData')}</Text>;
  return (
    <View>
      {rows.map((r) => {
        const expanded = open === r.key;
        return (
          <View key={r.key} style={styles.row}>
            <TouchableOpacity
              onPress={() => setOpen(expanded ? null : r.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>
                  {categoryRowName(r, t('allAccounts.other'), type)}
                </Text>
                <Text style={styles.amount}>{formatCurrency(r.total, currency)}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round((r.total / max) * 100)}%` }]} />
              </View>
            </TouchableOpacity>
            {expanded &&
              Object.entries(r.perAccount).map(([id, v]) => (
                <View key={id} style={styles.sub2}>
                  <Text style={styles.sub} numberOfLines={1}>
                    {nameOf(id)}
                  </Text>
                  <Text style={styles.sub}>{formatCurrency(v, currency)}</Text>
                </View>
              ))}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    gap: 4,
  },
  top: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[2],
  },
  name: { flex: 1, ...theme.textStyles.body, color: theme.colors.textPrimary },
  amount: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.divider,
    overflow: 'hidden' as const,
    marginTop: 4,
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  sub2: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: theme.spacing[3],
  },
});
