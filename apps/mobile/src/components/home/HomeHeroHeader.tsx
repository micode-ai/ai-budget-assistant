import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { SafeToSpendResponse } from '@budget/shared-types';
import { useStyles, type Theme } from '@/theme';
import { AccountSwitcher, CurrencyPill } from '@/components/AccountSwitcher';

interface HomeHeroHeaderProps {
  showQuickActions: boolean;
  unreadAlertCount: number;
  showSafeToSpend: boolean;
  hasSafeToSpend: boolean;
  safeToSpendData: SafeToSpendResponse | null;
  onOpenSafeToSpend: () => void;
}

export function HomeHeroHeader({
  showQuickActions,
  unreadAlertCount,
  showSafeToSpend,
  hasSafeToSpend,
  safeToSpendData,
  onOpenSafeToSpend,
}: HomeHeroHeaderProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={[styles.heroHeader, !showQuickActions && styles.heroHeaderNoStrip]}>
      <View style={styles.heroTopRow}>
        <AccountSwitcher compact showCurrency={false} />
        <CurrencyPill compact />
        <View style={styles.heroTopSpacer} />
        <TouchableOpacity
          onPress={() => router.push('/alerts' as any)}
          style={[styles.settingsButton, styles.bellButton]}
        >
          <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
          {unreadAlertCount > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{unreadAlertCount > 9 ? '9+' : unreadAlertCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.settingsButton}
        >
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.heroDivider} />
      {/* Safe-to-spend hero number — shown when widget is visible and data available */}
      {showSafeToSpend && hasSafeToSpend && safeToSpendData && (
        <TouchableOpacity
          style={styles.heroStsRow}
          onPress={onOpenSafeToSpend}
          activeOpacity={0.7}
        >
          <View>
            <Text style={styles.heroStsLabel}>{t('safeToSpend.title')}</Text>
            <Text style={styles.heroStsAmount}>
              {formatCurrency(safeToSpendData.safeToSpendToday, safeToSpendData.baseCurrency)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Orange Hero Header — paddingBottom leaves room for the first quick-action
  // row to overlap up into the orange (the grid uses a matching negative margin).
  heroHeader: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: 24,
  },
  heroHeaderNoStrip: {
    paddingBottom: theme.spacing[1],
  },
  heroTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
  },
  settingsButton: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
  },
  bellButton: {
    marginRight: theme.spacing[2],
  },
  alertBadge: {
    position: 'absolute' as const,
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E53935',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 3,
  },
  alertBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  heroTopSpacer: {
    flex: 1,
  },
  // Centered white separator under the header controls (matches the tab headers).
  heroDivider: {
    alignSelf: 'center' as const,
    width: '95%' as const,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginBottom: theme.spacing[2],
  },
  // Safe-to-spend hero number
  heroStsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[1],
    paddingBottom: theme.spacing[3],
  },
  heroStsLabel: {
    ...theme.textStyles.caption,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 2,
  },
  heroStsAmount: {
    fontSize: 22,
    fontFamily: theme.fonts.bold,
    color: '#FFFFFF',
    fontWeight: '900' as const,
  },
});
