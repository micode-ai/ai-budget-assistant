import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useStyles, type Theme } from '@/theme';

export function UsageWarning() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { tier, aiRequestsUsed, aiRequestsLimit, percentUsed } =
    useSubscriptionStore();

  // Don't show for business tier or when usage is under 80%
  if (tier === 'business' || percentUsed < 80) return null;

  const isExhausted = percentUsed >= 100;

  return (
    <TouchableOpacity
      style={[styles.container, isExhausted && styles.containerError]}
      onPress={() => router.push('/subscription' as any)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isExhausted ? 'warning' : 'information-circle'}
        size={18}
        color={isExhausted ? '#FF6B6B' : '#F5A623'}
      />
      <Text style={[styles.text, isExhausted && styles.textError]} numberOfLines={1}>
        {isExhausted
          ? t('subscription.limitReached')
          : `${aiRequestsUsed}/${aiRequestsLimit} ${t('subscription.aiRequests')}`}
      </Text>
      <Text style={styles.link}>{t('subscription.upgrade')}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.warningLight,
  },
  containerError: {
    backgroundColor: theme.colors.dangerLight,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.warning,
    fontWeight: '500' as const,
  },
  textError: {
    color: theme.colors.danger,
  },
  link: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
