import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useInboundReceiptStore } from '@/stores/inboundReceiptStore';

/**
 * Expenses-tab banner (ABA-644): "E-mail receipts to confirm: N", linking to the
 * inbox. Renders nothing while the count is zero, while the feature is unavailable
 * (the count call answers 404 with the server flag off) and for a viewer, who has
 * nothing to confirm. The count is fetched on tab focus and on account switch.
 */
export function InboundReceiptsBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const availability = useInboundReceiptStore((s) => s.availability);
  const count = useInboundReceiptStore((s) => s.pendingCount);

  useFocusEffect(
    useCallback(() => {
      if (currentAccountId) void useInboundReceiptStore.getState().loadCount();
    }, [currentAccountId]),
  );

  if (availability === 'unavailable' || !canEdit || count <= 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/inbox/email-receipts' as any)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="mail-unread-outline" size={18} color={theme.colors.primary} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {t('emailReceipts.bannerText', { count })}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginVertical: theme.spacing[2],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  pressed: { opacity: 0.85 },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
  },
  text: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
});
