import React, { useEffect } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useTheme, useStyles, type Theme } from '@/theme';

interface AiUsageBadgeProps {
  /**
   * Called immediately before this badge navigates to `/subscription`.
   *
   * Optional and defaulted to nothing, so every existing call site — the two
   * routed capture screens and `_layout.tsx`'s `headerRight` — behaves exactly
   * as before. A dialog host passes its own `onClose`: an RN `Modal` portals
   * itself above the whole document, so without this the badge would push a
   * route the user could see nothing of, behind a dialog that outlived the
   * screen it belonged to.
   */
  onNavigate?: () => void;
}

export function AiUsageBadge({ onNavigate }: AiUsageBadgeProps = {}) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { tier, aiRequestsUsed, aiRequestsLimit, percentUsed, loadUsage, loadSubscription } =
    useSubscriptionStore();

  useEffect(() => {
    loadSubscription();
    loadUsage();
  }, [loadSubscription, loadUsage]);

  if (tier === 'business') return null;

  const isLow = percentUsed >= 80;
  const isExhausted = percentUsed >= 100;

  return (
    <TouchableOpacity
      style={[styles.badge, isLow && styles.badgeWarning, isExhausted && styles.badgeError]}
      onPress={() => {
        onNavigate?.();
        router.push('/subscription' as any);
      }}
      activeOpacity={0.7}
    >
      <Ionicons
        name="sparkles"
        size={12}
        color={isExhausted ? '#FF6B6B' : isLow ? '#F5A623' : theme.colors.primary}
      />
      <Text
        style={[styles.text, isLow && styles.textWarning, isExhausted && styles.textError]}
      >
        {aiRequestsLimit === Infinity
          ? `${aiRequestsUsed} AI`
          : `${aiRequestsUsed}/${aiRequestsLimit} AI`}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryLight,
  },
  badgeWarning: {
    backgroundColor: theme.colors.warningLight,
  },
  badgeError: {
    backgroundColor: theme.colors.dangerLight,
  },
  text: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  textWarning: {
    color: theme.colors.warning,
  },
  textError: {
    color: theme.colors.danger,
  },
});
