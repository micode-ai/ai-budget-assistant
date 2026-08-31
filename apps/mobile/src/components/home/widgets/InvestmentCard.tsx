import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { convertAmount } from '@/stores/exchangeRateStore';
import type { HomeWidgetContext } from '../HomeWidgetContext';

/** The investment-portfolio card — only rendered when the current account is an investment account. */
export function InvestmentCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { investmentSummary, currency, rates } = ctx;

  if (!investmentSummary) return null;

  return (
    <TouchableOpacity key="investment" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/investment')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('investments.portfolio')}</Text>
      </View>
      <View style={styles.investmentRow}>
        <View style={styles.investmentCol}>
          <Text style={styles.investmentLabel}>{t('investments.totalValue')}</Text>
          <Text style={styles.investmentValue}>
            {formatCurrency(convertAmount(investmentSummary.totalValue, 'USD', currency, rates), currency)}
          </Text>
        </View>
        <View style={styles.investmentCol}>
          <Text style={styles.investmentLabel}>{t('investments.dayChange')}</Text>
          <Text style={[
            styles.investmentValue,
            { color: investmentSummary.totalPnL >= 0 ? theme.colors.success : theme.colors.danger },
          ]}>
            {investmentSummary.totalPnL >= 0 ? '+' : ''}
            {formatCurrency(convertAmount(investmentSummary.totalPnL, 'USD', currency, rates), currency)}
          </Text>
        </View>
      </View>
      <Text style={styles.investmentHoldingsCount}>
        {t('investments.holdingsCount', { count: investmentSummary.holdings.length })}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  cardHeader: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  investmentRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[4],
  },
  investmentCol: {
    flex: 1,
  },
  investmentLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  investmentValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  investmentHoldingsCount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
  },
});
