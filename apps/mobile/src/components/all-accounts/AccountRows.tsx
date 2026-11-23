import { Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsAccountRow } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { accountColor, changeRatio } from '@/features/all-accounts/allAccountsDisplay';

interface Props {
  accounts: AllAccountsAccountRow[];
  currency: string;
  loading: boolean;
  /** Group screens pass false: membership is fixed there. */
  canToggle: boolean;
  onToggle: (id: string, include: boolean) => void;
  onOpen: (id: string) => void;
}

/** Account rows: spent, change vs the previous period and a share bar. Excluded/encrypted rows never show 0. */
export function AccountRows({ accounts, currency, loading, canToggle, onToggle, onOpen }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const maxSpent = Math.max(
    1,
    ...accounts.filter((a) => a.included && !a.encrypted).map((a) => a.spent)
  );

  return (
    <View>
      {accounts.map((a, i) => {
        const counted = a.included && !a.encrypted;
        const color = accountColor(i, theme.colors);
        const change = counted ? changeRatio(a.spent, a.prevSpent) : null;
        return (
          <View key={a.id} style={styles.row}>
            <TouchableOpacity
              style={styles.main}
              onPress={counted ? () => onOpen(a.id) : undefined}
              activeOpacity={counted ? 0.7 : 1}
              accessibilityRole="button"
            >
              <View style={styles.top}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={styles.name} numberOfLines={1}>
                  {a.name}
                </Text>
                {counted && <Text style={styles.amount}>{formatCurrency(a.spent, currency)}</Text>}
              </View>
              {counted ? (
                <>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.round((a.spent / maxSpent) * 100)}%`,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                  {change !== null && (
                    <Text
                      style={[
                        styles.sub,
                        { color: change > 0 ? theme.colors.danger : theme.colors.success },
                      ]}
                    >
                      {`${change > 0 ? '+' : ''}${Math.round(change * 100)}% ${t('allAccounts.vsPrevious')}`}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.sub}>
                  {a.encrypted ? t('allAccounts.encryptedNotIncluded') : t('netWorth.excluded')}
                </Text>
              )}
              {a.shared && <Text style={styles.sub}>{t('allAccounts.sharedHint')}</Text>}
            </TouchableOpacity>
            {canToggle && (
              <Switch
                value={counted}
                disabled={a.encrypted || loading}
                onValueChange={(v) => onToggle(a.id, v)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                accessibilityLabel={a.name}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  main: { flex: 1, minWidth: 0, gap: 4 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
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
  },
  fill: { height: 6, borderRadius: 3 },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
});
