import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { SubscriptionTier } from '@budget/shared-types';

type IconName = keyof typeof Ionicons.glyphMap;

const TIER_ICONS: Record<SubscriptionTier, IconName> = {
  free: 'leaf-outline',
  pro: 'diamond-outline',
  business: 'rocket-outline',
};

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free: '#9CA3B4',
  pro: '#4ECDC4',
  business: '#F5A623',
};

const PLAN_COLORS: Record<string, string> = {
  pro: '#4ECDC4',
  business: '#F5A623',
};

const PLAN_ICONS: Record<string, IconName> = {
  pro: 'diamond-outline',
  business: 'rocket-outline',
};

interface PlanFeature {
  icon: IconName;
  text: string;
}

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const {
    tier,
    status,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    trialEnd,
    aiRequestsUsed,
    aiRequestsLimit,
    bonusAiRequests,
    percentUsed,
    plans,
    isLoading,
    loadSubscription,
    loadUsage,
    loadPlans,
    createCheckout,
    openPortal,
  } = useSubscriptionStore();

  useEffect(() => {
    loadSubscription();
    loadUsage();
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpgrade = async (priceEnvKey: string) => {
    try {
      const url = await createCheckout(priceEnvKey);
      await WebBrowser.openAuthSessionAsync(url, 'aibudget://subscription/success');
      // Browser closed — reload subscription data
      loadSubscription();
      loadUsage();
    } catch (error) {
      console.error('Failed to open checkout:', error);
    }
  };

  const handleManage = async () => {
    try {
      const url = await openPortal();
      await WebBrowser.openAuthSessionAsync(url, 'aibudget://subscription');
      // Browser closed — reload subscription data
      loadSubscription();
      loadUsage();
    } catch (error) {
      console.error('Failed to open portal:', error);
    }
  };

  const proFeatures: PlanFeature[] = [
    { icon: 'sparkles-outline', text: t('subscription.features.aiRequests300') },
    { icon: 'people-outline', text: t('subscription.features.accounts5') },
    { icon: 'person-add-outline', text: t('subscription.features.members5') },
    { icon: 'analytics-outline', text: t('subscription.features.predictiveAnalytics') },
    { icon: 'alert-circle-outline', text: t('subscription.features.anomalyDetection') },
    { icon: 'wallet-outline', text: t('subscription.features.unlimitedCurrencies') },
  ];

  const businessFeatures: PlanFeature[] = [
    { icon: 'infinite-outline', text: t('subscription.features.unlimitedAi') },
    { icon: 'business-outline', text: t('subscription.features.unlimitedAccounts') },
    { icon: 'people-outline', text: t('subscription.features.unlimitedMembers') },
    { icon: 'document-text-outline', text: t('subscription.features.advancedReporting') },
  ];

  const featuresByTier: Record<string, PlanFeature[]> = {
    pro: proFeatures,
    business: businessFeatures,
  };

  // Filter plans based on current tier
  const availablePlans = plans.filter((plan) => {
    if (tier === 'free') return true;
    if (tier === 'pro') return plan.tier === 'business';
    return false;
  });

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Current Plan */}
        <View style={styles.section}>
          <View style={styles.currentPlan}>
            <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[tier] + '20' }]}>
              <Ionicons name={TIER_ICONS[tier]} size={24} color={TIER_COLORS[tier]} />
            </View>
            <Text style={styles.tierName}>{tier.toUpperCase()}</Text>
            <Text style={styles.statusText}>
              {status === 'trialing'
                ? t('subscription.trialActive')
                : cancelAtPeriodEnd
                  ? t('subscription.cancelsAt', {
                      date: currentPeriodEnd
                        ? new Date(currentPeriodEnd).toLocaleDateString(getIntlLocale())
                        : '',
                    })
                  : t(`subscription.status.${status}`)}
            </Text>
            {status === 'trialing' && trialEnd && (
              <Text style={styles.trialEndDate}>
                {t('subscription.trialEndsAt', {
                  date: new Date(trialEnd).toLocaleDateString(getIntlLocale()),
                })}
              </Text>
            )}

            {tier !== 'free' && (
              <TouchableOpacity
                style={styles.manageButton}
                onPress={handleManage}
                disabled={isLoading}
              >
                <Text style={styles.manageButtonText}>
                  {t('subscription.manage')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Usage */}
        {tier !== 'business' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('subscription.usageThisMonth')}</Text>
            <View style={styles.card}>
              <View style={styles.usageRow}>
                <Text style={styles.usageLabel}>{t('subscription.aiRequests')}</Text>
                <Text style={styles.usageValue}>
                  {aiRequestsUsed} / {aiRequestsLimit === Infinity ? '∞' : aiRequestsLimit}
                  {bonusAiRequests > 0 ? ` (+${bonusAiRequests})` : ''}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(percentUsed, 100)}%`,
                      backgroundColor:
                        percentUsed >= 100
                          ? theme.colors.danger
                          : percentUsed >= 80
                            ? theme.colors.warning
                            : theme.colors.primary,
                    },
                  ]}
                />
              </View>
              {status === 'trialing' && (
                <Text style={styles.trialLimitNote}>
                  {t('subscription.trialLimitNote')}
                </Text>
              )}
              <TouchableOpacity
                style={styles.usageDetailsButton}
                onPress={() => router.push('/settings/ai-usage-details' as any)}
              >
                <Text style={styles.usageDetailsText}>{t('subscription.viewDetails')}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Upgrade Plans */}
        {availablePlans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('subscription.availablePlans')}</Text>

            {availablePlans.map((plan) => {
              const color = PLAN_COLORS[plan.tier] || theme.colors.primary;
              const icon = PLAN_ICONS[plan.tier] || 'star-outline';
              const features = featuresByTier[plan.tier] || [];

              return (
                <View
                  key={plan.tier}
                  style={[
                    styles.planCard,
                    { borderColor: color },
                  ]}
                >
                  <View style={styles.planHeader}>
                    <Ionicons name={icon} size={22} color={color} />
                    <Text style={styles.planName}>{plan.name}</Text>
                  </View>

                  <View style={styles.planPricing}>
                    <Text style={styles.planPriceMain}>{plan.monthly.display}</Text>
                    <Text style={styles.planPricePeriod}>/{t('subscription.month')}</Text>
                  </View>

                  {plan.tier === 'business' && (
                    <Text style={styles.includesText}>
                      {t('subscription.includesProFeatures')}
                    </Text>
                  )}

                  {features.map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons name={f.icon} size={16} color={color} />
                      <Text style={styles.featureText}>{f.text}</Text>
                    </View>
                  ))}

                  <View style={styles.planButtons}>
                    <TouchableOpacity
                      style={styles.planButton}
                      onPress={() => handleUpgrade(plan.monthly.priceEnvKey)}
                      disabled={isLoading}
                    >
                      <Text style={styles.planButtonText}>
                        {plan.monthly.display}/{t('subscription.month')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.planButton, styles.planButtonPrimary]}
                      onPress={() => handleUpgrade(plan.yearly.priceEnvKey)}
                      disabled={isLoading}
                    >
                      <Text style={[styles.planButtonText, styles.planButtonTextPrimary]}>
                        {plan.yearly.display}/{t('subscription.year')} (-20%)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.trialText}>{t('subscription.trial')}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },

  // Current plan
  currentPlan: {
    alignItems: 'center' as const,
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
  },
  tierBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  tierName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  trialEndDate: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500' as const,
    marginBottom: 16,
  },
  manageButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },

  // Usage
  card: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
  },
  usageRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  usageLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  usageValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  trialLimitNote: {
    fontSize: 12,
    color: theme.colors.warning,
    marginTop: 8,
  },
  usageDetailsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    gap: 4,
  },
  usageDetailsText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.primary,
  },

  // Plan cards
  planCard: {
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  planHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 12,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  planPricing: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    marginBottom: 16,
  },
  planPriceMain: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  planPricePeriod: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 2,
  },
  includesText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500' as const,
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  planButtons: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 16,
  },
  planButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  planButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  planButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  planButtonTextPrimary: {
    color: theme.colors.textInverse,
  },
  trialText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: 8,
  },
});
