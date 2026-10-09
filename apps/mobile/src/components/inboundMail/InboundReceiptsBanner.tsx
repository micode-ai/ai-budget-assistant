import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useInboundReceiptStore } from '@/stores/inboundReceiptStore';
import { emphasiseCount } from '@/utils/emphasiseCount';

/**
 * Expenses-tab banner (ABA-644): "E-mail receipts to confirm: N", linking to the
 * inbox. Renders nothing while the count is zero, while the feature is unavailable
 * (the count call answers 404 with the server flag off) and for a viewer, who has
 * nothing to confirm. The count is fetched on tab focus and on account switch.
 *
 * `desktop` (ABA-646, default false so the phone call keeps its layout by construction) draws the
 * same facts the way the `UncategorizedBanner`s stacked right under it are drawn: the row is not
 * pressable, the count is bold, and a labelled "Review" pill is the one focus stop, with hover and
 * focus feedback. It navigates to the inbox rather than opening a dialog, because the inbox opens a
 * dialog per row and dialogs must not nest.
 */
export function InboundReceiptsBanner({ desktop = false }: { desktop?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const availability = useInboundReceiptStore((s) => s.availability);
  const count = useInboundReceiptStore((s) => s.pendingCount);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (currentAccountId) void useInboundReceiptStore.getState().loadCount();
    }, [currentAccountId]),
  );

  if (availability === 'unavailable' || !canEdit || count <= 0) return null;

  if (desktop) {
    const { before, countText, after, found } = emphasiseCount(t('emailReceipts.bannerText', { count }), count);
    return (
      <View style={styles.banner}>
        <View style={styles.lead}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-unread-outline" size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.text}>
            {before}
            {found ? <Text style={styles.count}>{countText}</Text> : null}
            {after}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/inbox/email-receipts' as any)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            (pressed || hovered) && styles.actionPressed,
            focused && styles.actionFocused,
          ]}
        >
          <Text style={styles.actionText} numberOfLines={1}>
            {t('emailReceipts.bannerAction')}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.textInverse} />
        </Pressable>
      </View>
    );
  }

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
  // Desktop variant: the same shell, lead, text and action tokens as `UncategorizedBanner`.
  lead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
  },
  count: { fontFamily: theme.fonts.bold },
  action: {
    marginLeft: 'auto' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    minHeight: 36,
    paddingHorizontal: theme.spacing[3.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actionPressed: { opacity: 0.85 },
  // A visible keyboard-focus ring; `surface` reads against both `primary` and `primaryLight`.
  actionFocused: { borderColor: theme.colors.surface },
  actionText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textInverse },
});
