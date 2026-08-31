import { View, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { HomeWidgetContext } from '../HomeWidgetContext';

export function WalletsSection({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { walletSummary, canEdit } = ctx;

  return (
    <View key="wallets" style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('dashboard.walletBalances')}</Text>
        {walletSummary.length > 0 && (
          <TouchableOpacity onPress={() => router.push('/wallet')}>
            <Text style={styles.seeAllText}>{t('dashboard.seeAll')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {walletSummary.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyStateText}>{t('wallet.noBalances')}</Text>
          <Text style={styles.emptyStateSubtext}>{t('wallet.noBalancesHint')}</Text>
          {canEdit && (
            <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/wallet/set-balance')}>
              <Text style={styles.emptyStateButtonText}>{t('wallet.addBalance')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.walletGrid, Platform.OS === 'web' && styles.webCenterRow]}
          style={styles.walletGridScroll}
        >
          {walletSummary.map((summary) => (
            <TouchableOpacity key={summary.currencyCode} style={styles.walletCard} onPress={() => router.push('/wallet')}>
              <Text style={styles.walletCurrency}>{summary.currencyCode}</Text>
              <Text
                style={[styles.walletBalance, summary.currentBalance < 0 && { color: theme.colors.danger }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(summary.currentBalance, summary.currencyCode)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  seeAllText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textLink,
  },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[8],
    alignItems: 'center' as const,
  },
  emptyStateText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
  },
  emptyStateSubtext: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  emptyStateButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[5],
    marginTop: theme.spacing[4],
  },
  emptyStateButtonText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
  walletGridScroll: {
    marginHorizontal: -theme.spacing[4],
  },
  walletGrid: {
    flexDirection: 'row' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[1],
    gap: theme.spacing[2],
  },
  // Web no-op kept so the JSX style array stays valid (grid already centers).
  webCenterRow: {
    justifyContent: 'center' as const,
  },
  walletCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    width: 140,
    ...theme.shadows.sm,
  },
  walletCurrency: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  walletBalance: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
});
