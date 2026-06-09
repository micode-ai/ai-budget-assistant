import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { PortfolioAnalyticsResponse } from '@budget/shared-types';

type GainerItem = PortfolioAnalyticsResponse['topGainers'][number];

interface Props {
  topGainers: GainerItem[];
  topLosers: GainerItem[];
  onInfoPress: () => void;
}

export function GainersCard({ topGainers, topLosers, onInfoPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (topGainers.length === 0 && topLosers.length === 0) return null;

  return (
    <>
      {topGainers.length > 0 && (
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onInfoPress}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t('investments.topGainers')}</Text>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
          </View>
          {topGainers.map((item) => (
            <View key={item.symbol} style={styles.row}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <View style={styles.badge}>
                <Ionicons name="arrow-up" size={14} color={theme.colors.success} />
                <Text style={[styles.percent, { color: theme.colors.success }]}>
                  +{item.pnlPercent.toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </TouchableOpacity>
      )}

      {topLosers.length > 0 && (
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onInfoPress}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t('investments.topLosers')}</Text>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.textTertiary} />
          </View>
          {topLosers.map((item) => (
            <View key={item.symbol} style={styles.row}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <View style={styles.badge}>
                <Ionicons name="arrow-down" size={14} color={theme.colors.danger} />
                <Text style={[styles.percent, { color: theme.colors.danger }]}>
                  {item.pnlPercent.toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </TouchableOpacity>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  symbol: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  percent: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
  },
});
