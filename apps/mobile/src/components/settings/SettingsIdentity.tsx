import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * The two things on the settings hub that belong to settings as a whole rather
 * than to any one category: who you are signed in as, and signing out.
 *
 * They are shared rather than copied because the desktop shell shows exactly
 * these two in its right pane when nothing is selected — that is what makes the
 * no-selection state real content instead of a placeholder. The JSX and styles
 * are the hub's, moved unchanged; the mobile rendering must not change.
 */
export function SettingsProfileCard() {
  const styles = useStyles(createStyles);
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </View>
    </View>
  );
}

export function SettingsLogoutButton() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const logout = useAuthStore((s) => s.logout);

  // `showAlert`, never `Alert.alert`: react-native-web stubs the latter to a
  // no-op, so on the one platform the shell exists the confirmation would
  // simply never appear and the tap would do nothing.
  const handleLogout = () => {
    showAlert(
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
    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
      <Ionicons name="log-out-outline" size={20} color={theme.colors.danger} />
      <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
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
