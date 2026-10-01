import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function AffordabilityResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shared = useStyles(createSharedResultStyles);
  const styles = useStyles(createStyles);

  const affordable = Boolean(data.affordable);
  const reasonCode = String(data.reasonCode ?? '');
  const amount = Number(data.amount ?? 0);
  const currencyCode = String(data.currencyCode ?? '');
  const safeToSpendToday = Number(data.safeToSpendToday ?? 0);
  const baseCurrency = String(data.baseCurrency ?? currencyCode);
  const goalImpact = data.goalImpact as { goalName: string; slipDays: number } | undefined;
  const suggestedDate = data.suggestedDate as string | undefined;

  const reasonLabel = (() => {
    switch (reasonCode) {
      case 'within_safe':
        return t('affordability.yes');
      case 'within_available_tight':
        return t('affordability.tight');
      case 'delays_goal':
        return t('affordability.delaysGoal');
      case 'wait_until_income':
        return suggestedDate
          ? t('affordability.waitUntil', { date: suggestedDate })
          : t('affordability.no');
      case 'currency_unconvertible':
        return t('affordability.currencyUnconvertible');
      case 'over_available':
      default:
        return t('affordability.no');
    }
  })();

  const chipColor = affordable ? theme.colors.success : theme.colors.danger;
  const chipIcon = affordable ? 'checkmark-circle' : 'close-circle';

  return (
    <View style={[shared.card, affordable ? shared.successCard : shared.errorCard]}>
      {/* Verdict chip */}
      <View style={styles.affordabilityChip}>
        <Ionicons name={chipIcon} size={20} color={chipColor} />
        <Text style={[styles.affordabilityVerdict, { color: chipColor }]}>
          {reasonCode === 'currency_unconvertible' ? reasonLabel : affordable ? t('affordability.yes') : t('affordability.no')}
        </Text>
      </View>

      {/* Reason line */}
      <Text style={styles.affordabilityReason}>{reasonLabel}</Text>

      {/* Amount vs safe-to-spend */}
      <View style={styles.affordabilityRow}>
        <Text style={styles.affordabilityLabel}>
          {amount.toFixed(2)} {currencyCode}
        </Text>
        <Text style={styles.affordabilityMeta}>
          {'/ '}{t('safeToSpend.today')}{': '}{safeToSpendToday.toFixed(2)} {baseCurrency}
        </Text>
      </View>

      {/* Goal impact — when purchase delays a goal */}
      {goalImpact && (
        <Text style={styles.affordabilityGoalImpact}>
          {t('affordability.delaysGoal')}{': '}{goalImpact.goalName}
          {' ('}+{goalImpact.slipDays}d{')'}
        </Text>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  affordabilityChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[1.5],
  },
  affordabilityVerdict: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  affordabilityReason: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  affordabilityRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[1.5],
    flexWrap: 'wrap' as const,
  },
  affordabilityLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  affordabilityMeta: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  affordabilityGoalImpact: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    marginTop: theme.spacing[1.5],
  },
});
