import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { AllAccountsMoney } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export function TotalsTiles({ totals, currency }: { totals: AllAccountsMoney; currency: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const tiles = [
    { label: t('allAccounts.spent'), value: totals.spent, color: theme.colors.textPrimary },
    { label: t('allAccounts.income'), value: totals.income, color: theme.colors.success },
    {
      label: t('allAccounts.net'),
      value: totals.net,
      color: totals.net < 0 ? theme.colors.danger : theme.colors.textPrimary,
    },
  ];
  return (
    <View style={styles.row}>
      {tiles.map((x) => (
        <View key={x.label} style={styles.tile}>
          <Text style={styles.label}>{x.label}</Text>
          <Text style={[styles.value, { color: x.color }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(x.value, currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing[2] },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  label: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  value: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums' as const],
  },
});
