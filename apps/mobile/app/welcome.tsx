import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useTheme, useStyles, type Theme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const FREE_FEATURES: { icon: IconName; key: string }[] = [
  { icon: 'sparkles-outline', key: 'freeAiRequests' },
  { icon: 'wallet-outline', key: 'freeAccount' },
  { icon: 'person-outline', key: 'freeMember' },
  { icon: 'receipt-outline', key: 'freeTracking' },
];

const PLAN_COLORS: Record<string, string> = {
  pro: '#4ECDC4',
  business: '#F5A623',
};

const PLAN_ICONS: Record<string, IconName> = {
  pro: 'diamond-outline',
  business: 'rocket-outline',
};

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { plans, isLoading, loadPlans, createCheckout } = useSubscriptionStore();

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpgrade = async (priceEnvKey: string) => {
    try {
      const url = await createCheckout(priceEnvKey);
      await WebBrowser.openAuthSessionAsync(url, 'aibudget://subscription/success');
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to open checkout:', error);
    }
  };

  const handleContinueFree = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Welcome Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="wallet-outline" size={40} color={theme.colors.primary} />
          </View>
          <Text style={styles.heading}>{t('welcome.heading')}</Text>
          <Text style={styles.subheading}>{t('welcome.subheading')}</Text>
        </View>

        {/* Free Plan Description */}
        <View style={styles.freeSection}>
          <Text style={styles.sectionTitle}>{t('welcome.freeIncluded')}</Text>
          <View style={styles.freeCard}>
            {FREE_FEATURES.map((feature) => (
              <View key={feature.key} style={styles.featureRow}>
                <Ionicons name={feature.icon} size={18} color={theme.colors.primary} />
                <Text style={styles.featureText}>{t(`welcome.${feature.key}`)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Upgrade Plans */}
        {plans.length > 0 && (
          <View style={styles.plansSection}>
            <Text style={styles.sectionTitle}>{t('welcome.wantMore')}</Text>

            {plans.map((plan) => {
              const color = PLAN_COLORS[plan.tier] || theme.colors.primary;
              const icon = PLAN_ICONS[plan.tier] || ('star-outline' as IconName);

              return (
                <View key={plan.tier} style={[styles.planCard, { borderColor: color }]}>
                  <View style={styles.planHeader}>
                    <Ionicons name={icon} size={20} color={color} />
                    <Text style={styles.planName}>{plan.name}</Text>
                  </View>

                  <View style={styles.planPricing}>
                    <Text style={styles.planPriceMain}>{plan.monthly.display}</Text>
                    <Text style={styles.planPricePeriod}>/{t('subscription.month')}</Text>
                  </View>

                  {plan.features.map((feature, i) => (
                    <View key={i} style={styles.planFeatureRow}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={color} />
                      <Text style={styles.planFeatureText}>{feature}</Text>
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

        {isLoading && plans.length === 0 && (
          <ActivityIndicator style={{ marginVertical: 20 }} color={theme.colors.primary} />
        )}

        {/* Continue with Free */}
        <TouchableOpacity style={styles.continueButton} onPress={handleContinueFree}>
          <Text style={styles.continueButtonText}>{t('welcome.continueWithFree')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  header: {
    alignItems: 'center' as const,
    marginBottom: 28,
    paddingTop: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  heading: {
    fontSize: 26,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center' as const,
  },
  subheading: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },

  // Free section
  freeSection: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  freeCard: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  featureText: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    flex: 1,
  },

  // Plans section
  plansSection: { marginBottom: 24 },
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
    marginBottom: 10,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  planPricing: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    marginBottom: 14,
  },
  planPriceMain: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  planPricePeriod: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 2,
  },
  planFeatureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 6,
  },
  planFeatureText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  planButtons: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 14,
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

  // Continue button
  continueButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    marginTop: 4,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
});
