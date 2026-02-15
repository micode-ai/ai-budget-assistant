import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useStyles, type Theme } from '@/theme';
import { getLegalUrls } from '@/constants/legal';

interface PaywallProps {
  feature: string;
  requiredTier: 'pro' | 'business';
  onDismiss?: () => void;
}

export function Paywall({ feature, requiredTier, onDismiss }: PaywallProps) {
  const { t, i18n } = useTranslation();
  const legalUrls = getLegalUrls(i18n.language);
  const styles = useStyles(createStyles);
  const createCheckout = useSubscriptionStore((s) => s.createCheckout);
  const isLoading = useSubscriptionStore((s) => s.isLoading);
  const plans = useSubscriptionStore((s) => s.plans);
  const loadPlans = useSubscriptionStore((s) => s.loadPlans);

  useEffect(() => {
    if (plans.length === 0) loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = plans.find((p) => p.tier === requiredTier);

  const handleUpgrade = async (priceEnvKey: string) => {
    try {
      const url = await createCheckout(priceEnvKey);
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open checkout:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="lock-closed" size={32} color="#F5A623" />
      </View>

      <Text style={styles.title}>
        {t(`subscription.plans.${requiredTier}.name`)}
      </Text>

      <Text style={styles.message}>{feature}</Text>

      {plan && (
        <View style={styles.plans}>
          <TouchableOpacity
            style={styles.plan}
            onPress={() => handleUpgrade(plan.monthly.priceEnvKey)}
            disabled={isLoading}
          >
            <Text style={styles.planPrice}>{plan.monthly.display}</Text>
            <Text style={styles.planPeriod}>/{t('subscription.month')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.plan, styles.planRecommended]}
            onPress={() => handleUpgrade(plan.yearly.priceEnvKey)}
            disabled={isLoading}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>-20%</Text>
            </View>
            <Text style={styles.planPrice}>{plan.yearly.display}</Text>
            <Text style={styles.planPeriod}>/{t('subscription.year')}</Text>
            <Text style={styles.planSubtext}>
              {plan.monthlyEquivalent}/{t('subscription.month')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.trial}>{t('subscription.trial')}</Text>

      <Text style={styles.legalText}>
        {t('legal.bySubscribing')}{' '}
        <Text
          style={styles.legalLink}
          onPress={() => Linking.openURL(legalUrls.termsOfService)}
        >
          {t('legal.termsOfService')}
        </Text>
        {' '}{t('legal.and')}{' '}
        <Text
          style={styles.legalLink}
          onPress={() => Linking.openURL(legalUrls.privacyPolicy)}
        >
          {t('legal.privacyPolicy')}
        </Text>
      </Text>

      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
          <Text style={styles.dismissText}>{t('subscription.maybeLater')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    padding: 24,
    alignItems: 'center' as const,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.warningLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 24,
    lineHeight: 20,
  },
  plans: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 16,
  },
  plan: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
  },
  planRecommended: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  badge: {
    position: 'absolute' as const,
    top: -10,
    right: -4,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  planPeriod: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  planSubtext: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 4,
  },
  trial: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: 12,
  },
  dismissButton: {
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  legalText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginBottom: 12,
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  legalLink: {
    color: theme.colors.primary,
  },
});
