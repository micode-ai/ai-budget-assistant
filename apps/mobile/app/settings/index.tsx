import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingsCategory {
  icon: IconName;
  label: string;
  description: string;
  route: string;
  iconColor?: string;
}

export default function SettingsIndexScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user, logout } = useAuthStore();

  const categories: SettingsCategory[] = [
    {
      icon: 'person-outline',
      label: t('settingsNav.profile'),
      description: t('settingsNav.profileDesc'),
      route: '/settings/profile',
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
      icon: 'logo-whatsapp',
      label: t('whatsappBot.title'),
      description: t('whatsappBot.subtitle'),
      route: '/settings/whatsapp',
      iconColor: '#25D366',
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
      icon: 'pricetags-outline',
      label: t('settingsNav.categories'),
      description: t('settingsNav.categoriesDesc'),
      route: '/settings/categories',
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

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

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
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.danger} />
          <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
        </TouchableOpacity>
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

  // Profile header
  profileHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[6],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  avatarText: {
    ...theme.textStyles.h2,
    color: theme.colors.textInverse,
  },
  profileInfo: {
    marginLeft: theme.spacing[4],
    flex: 1,
  },
  userName: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  userEmail: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },

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

  // Logout
  logoutButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  logoutButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
});
