import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAccountRow } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { accountColor, changeRatio } from '@/features/all-accounts/allAccountsDisplay';
import {
  sortAccounts,
  type AccountSortKey,
  type SortDir,
} from '@/features/all-accounts/accountSort';

interface Props {
  accounts: AllAccountsAccountRow[];
  currency: string;
  loading: boolean;
  /** Group screens pass false: membership is fixed there. */
  canToggle: boolean;
  onToggle: (id: string, include: boolean) => void;
  onOpen: (id: string) => void;
}

/** Sortable account table. Excluded/encrypted rows say so instead of showing figures and always sort last. */
export function AccountTable({ accounts, currency, loading, canToggle, onToggle, onOpen }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [sort, setSort] = useState<{ key: AccountSortKey; dir: SortDir }>({
    key: 'spent',
    dir: 'desc',
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = useMemo(() => sortAccounts(accounts, sort.key, sort.dir), [accounts, sort]);

  const toggleSort = (key: AccountSortKey) =>
    setSort((p) =>
      p.key === key
        ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );

  const head = (key: AccountSortKey, label: string, numeric: boolean) => {
    const active = sort.key === key;
    return (
      <Pressable
        key={key}
        onPress={() => toggleSort(key)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        style={[
          numeric ? styles.numCell : styles.nameCell,
          styles.headCell,
          numeric && styles.headNum,
        ]}
      >
        <Text style={[styles.headText, active && styles.headActive]} numberOfLines={1}>
          {label}
        </Text>
        {active && (
          <Ionicons
            name={sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'}
            size={12}
            color={theme.colors.primary}
          />
        )}
      </Pressable>
    );
  };

  return (
    <View>
      <View style={styles.headRow}>
        {canToggle && <View style={styles.toggleCell} />}
        {head('name', t('allAccounts.accounts'), false)}
        {head('spent', t('allAccounts.spent'), true)}
        {head('income', t('allAccounts.income'), true)}
        {head('net', t('allAccounts.net'), true)}
        {head('change', t('allAccounts.vsPrevious'), true)}
      </View>
      {rows.map(({ account: a, index }) => {
        const counted = a.included && !a.encrypted;
        const change = counted ? changeRatio(a.spent, a.prevSpent) : null;
        return (
          <View key={a.id} style={[styles.row, hovered === a.id && counted && styles.rowHovered]}>
            {canToggle && (
              <View style={styles.toggleCell}>
                <Switch
                  value={counted}
                  disabled={a.encrypted || loading}
                  onValueChange={(v) => onToggle(a.id, v)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  accessibilityLabel={a.name}
                />
              </View>
            )}
            <Pressable
              style={styles.rowMain}
              onPress={counted ? () => onOpen(a.id) : undefined}
              onHoverIn={() => setHovered(a.id)}
              onHoverOut={() => setHovered(null)}
              accessibilityRole={counted ? 'button' : undefined}
              accessibilityLabel={a.name}
            >
              <View style={styles.nameCell}>
                <View
                  style={[styles.dot, { backgroundColor: accountColor(index, theme.colors) }]}
                />
                <View style={styles.nameText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {a.name}
                  </Text>
                  {a.shared && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {t('allAccounts.sharedHint')}
                    </Text>
                  )}
                </View>
              </View>
              {counted ? (
                <>
                  <Text style={[styles.numCell, styles.num]}>
                    {formatCurrency(a.spent, currency)}
                  </Text>
                  <Text style={[styles.numCell, styles.num]}>
                    {formatCurrency(a.income, currency)}
                  </Text>
                  <Text
                    style={[
                      styles.numCell,
                      styles.num,
                      { color: a.net < 0 ? theme.colors.danger : theme.colors.textPrimary },
                    ]}
                  >
                    {formatCurrency(a.net, currency)}
                  </Text>
                  <Text
                    style={[
                      styles.numCell,
                      styles.sub,
                      change !== null && {
                        color: change > 0 ? theme.colors.danger : theme.colors.success,
                      },
                    ]}
                  >
                    {change === null ? '—' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`}
                  </Text>
                </>
              ) : (
                <Text style={[styles.sub, styles.notCounted]}>
                  {a.encrypted ? t('allAccounts.encryptedNotIncluded') : t('netWorth.excluded')}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  headRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: theme.spacing[2],
  },
  headCell: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  headNum: { justifyContent: 'flex-end' as const },
  headText: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  headActive: { color: theme.colors.primary },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingVertical: theme.spacing[2],
  },
  rowHovered: { backgroundColor: theme.colors.surfaceSecondary },
  rowMain: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, minWidth: 0 },
  toggleCell: { width: 56 },
  nameCell: {
    flex: 2,
    minWidth: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  nameText: { flex: 1, minWidth: 0 },
  numCell: { flex: 1.2, textAlign: 'right' as const, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  num: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  notCounted: { flex: 4.8 },
});
