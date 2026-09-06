import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SettingsProfileCard, SettingsLogoutButton } from './SettingsIdentity';

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingsCategory {
  icon: IconName;
  label: string;
  description: string;
  route: string;
  iconColor?: string;
  badge?: number;
}

/**
 * The settings hub exactly as a phone has always rendered it: all 20 rows, one
 * card, in this order.
 *
 * It has ONE definition and both platform files import it — `SettingsIndexView`
 * (native) renders only this, and `SettingsIndexView.web` renders this below
 * `DESKTOP_MIN_WIDTH` and the two-pane shell at or above it. The pane/link
 * distinction the shell draws is a desktop-only idea and must never reach the
 * phone: if this rendering changes, that is a bug, not a feature.
 */
export function SettingsHubMobile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { pendingCount, loadPendingCount } = usePurchaseRequestStore();

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  const categories: SettingsCategory[] = [
    {
      icon: 'person-outline',
      label: t('settingsNav.profile'),
      description: t('settingsNav.profileDesc'),
      route: '/settings/profile',
    },
    {
      // Until this row existed, the accounts screen — and with it the financial
      // month setting — was reachable only by opening the account pill in the
      // header, which does not read as navigation.
      icon: 'albums-outline',
      label: t('accounts.manage'),
      description: t('settingsNav.accountsDesc'),
      route: '/account/list',
    },
    {
      icon: 'diamond-outline',
      label: t('subscription.managePlan'),
      description: t('settingsNav.subscriptionDesc'),
      route: '/subscription',
      iconColor: '#4ECDC4',
    },
    {
      icon: 'color-palette-outline',
      label: t('settingsNav.appearance'),
      description: t('settingsNav.appearanceDesc'),
      route: '/settings/appearance',
    },
    {
      icon: 'sparkles-outline',
      label: t('settingsNav.ai'),
      description: t('settingsNav.aiDesc'),
      route: '/settings/ai',
    },
    {
      icon: 'grid-outline',
      label: t('settingsNav.widgets'),
      description: t('settingsNav.widgetsDesc'),
      route: '/settings/widgets',
    },
    {
      icon: 'notifications-outline',
      label: t('settingsNav.notifications'),
      description: t('settingsNav.notificationsDesc'),
      route: '/settings/notifications',
    },
    {
      icon: 'chatbubbles-outline',
      label: t('settings.bots.title'),
      description: t('settings.bots.subtitle'),
      route: '/settings/bots',
    },
    {
      icon: 'cloud-download-outline',
      label: t('bankImport.title'),
      description: t('bankImport.subtitle'),
      route: '/settings/import',
    },
    {
      icon: 'shield-outline',
      label: t('settingsNav.security'),
      description: t('settingsNav.securityDesc'),
      route: '/settings/security',
    },
    {
      icon: 'library-outline',
      label: t('settingsNav.referenceData'),
      description: t('settingsNav.referenceDataDesc'),
      route: '/settings/reference',
    },
    {
      icon: 'repeat-outline',
      label: t('subscriptionManager.title'),
      description: t('subscriptionManager.settingsSubtitle'),
      route: '/subscriptions',
    },
    {
      icon: 'cart-outline',
      label: t('purchaseRequests.settingsTitle'),
      description: t('purchaseRequests.settingsSubtitle'),
      route: '/purchase-requests',
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      icon: 'basket-outline',
      label: t('shoppingList.title'),
      description: t('shoppingList.settingsSubtitle'),
      route: '/shopping-list',
    },
    {
      icon: 'wallet-outline',
      label: t('settingsNav.wallet'),
      description: t('settingsNav.walletDesc'),
      route: '/wallet',
    },
    {
      icon: 'cloud-outline',
      label: t('settingsNav.data'),
      description: t('settingsNav.dataDesc'),
      route: '/settings/data',
    },
    {
      icon: 'megaphone-outline',
      label: t('settingsNav.whatsNew'),
      description: t('settingsNav.whatsNewDesc'),
      route: '/whats-new',
    },
    {
      icon: 'information-circle-outline',
      label: t('settingsNav.about'),
      description: t('settingsNav.aboutDesc'),
      route: '/settings/about',
    },
    {
      icon: 'people-outline',
      label: t('referral.settingsTitle'),
      description: t('referral.settingsSubtitle'),
      route: '/referral',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: theme.spacing[10] + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <SettingsProfileCard />

        {/* Category rows */}
        <View style={styles.card}>
          {categories.map((category, index) => (
            <React.Fragment key={category.route}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(category.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={category.icon}
                    size={20}
                    color={category.iconColor || theme.colors.primary}
                  />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{category.label}</Text>
                  <Text style={styles.rowDescription} numberOfLines={1}>
                    {category.description}
                  </Text>
                </View>
                {category.badge !== undefined && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{category.badge}</Text>
                  </View>
                )}
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
              {index < categories.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Admin panel */}
        {user?.isAdmin && (
          <View style={styles.adminCard}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push('/admin' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.warning + '15' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.warning} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{t('admin.openPanel')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Logout */}
        <SettingsLogoutButton />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },

  // The profile header and logout styles live in `SettingsIdentity.tsx` with
  // the JSX that uses them — the desktop shell's no-selection pane renders the
  // same two pieces.

  // Card
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  adminCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },

  // Row
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  rowContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
    marginRight: theme.spacing[2],
  },
  rowLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  rowDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[1],
    marginRight: theme.spacing[1],
  },
  badgeText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.semiBold,
    fontSize: 11,
  },
});
