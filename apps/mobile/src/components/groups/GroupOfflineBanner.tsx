import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Shown on every group screen while the API is unreachable (ABA-648). Groups are online-only, so
 * the write buttons are disabled and this is their explanation. Reads are never blocked.
 */
export function GroupOfflineBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { isOffline } = useConnectivity();
  if (!isOffline) return null;
  return (
    <View style={[styles.banner, style]} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textSecondary} />
      <Text style={styles.text}>{t('groups.offlineBanner')}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  text: {
    flex: 1,
    color: theme.colors.textSecondary,
    ...theme.textStyles.bodySm,
  },
});
