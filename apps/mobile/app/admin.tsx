import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { getIntlLocale } from '@/i18n';
import type { AdminDashboardResponse, AdminUserUsageItem, SubscriptionTier } from '@budget/shared-types';

type IconName = keyof typeof Ionicons.glyphMap;

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free: '#9CA3B4',
  pro: '#4ECDC4',
  business: '#F5A623',
};

const TIER_ICONS: Record<SubscriptionTier, IconName> = {
  free: 'leaf-outline',
  pro: 'diamond-outline',
  business: 'rocket-outline',
};

const FEATURE_LABELS: Record<string, string> = {
  chat: 'admin.features.chat',
  voice: 'admin.features.voice',
  parse: 'admin.features.parse',
  categorization: 'admin.features.categorization',
  ocr: 'admin.features.ocr',
  story: 'admin.features.story',
  insights: 'admin.features.insights',
  tag_suggestion: 'admin.features.tag_suggestion',
  project_suggestion: 'admin.features.project_suggestion',
  split_suggestion: 'admin.features.split_suggestion',
  goal_plan: 'admin.features.goal_plan',
  investment_insights: 'admin.features.investment_insights',
  fat_finder: 'admin.features.fat_finder',
};

export default function AdminScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const result = await api.getAdminDashboard();
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error || 'Failed to load data'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const periodLabel = new Date(data.aiUsage.periodStart).toLocaleDateString(
    getIntlLocale(), {
    month: 'long',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* System Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('admin.systemStats')}</Text>
          <View style={styles.statsRow}>
            <StatCard
              icon="people-outline"
              label={t('admin.totalUsers')}
              value={data.totalUsers}
              color={theme.colors.primary}
              styles={styles}
              theme={theme}
            />
            <StatCard
              icon="wallet-outline"
              label={t('admin.totalAccounts')}
              value={data.totalAccounts}
              color={theme.colors.info}
              styles={styles}
              theme={theme}
            />
            <StatCard
              icon="receipt-outline"
              label={t('admin.totalExpenses')}
              value={data.totalExpenses}
              color={theme.colors.success}
              styles={styles}
              theme={theme}
            />
          </View>
        </View>

        {/* Subscription Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('admin.subscriptionBreakdown')}</Text>
          <View style={styles.card}>
            <View style={styles.badgesRow}>
              <TierBadge tier="free" count={data.subscriptions.free} styles={styles} />
              <TierBadge tier="pro" count={data.subscriptions.pro} styles={styles} />
              <TierBadge tier="business" count={data.subscriptions.business} styles={styles} />
              <View style={styles.tierBadge}>
                <View style={[styles.tierDot, { backgroundColor: '#AB47BC' }]} />
                <Text style={styles.tierBadgeText}>
                  {t('admin.trialing')} ({data.subscriptions.trialing})
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* AI Usage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('admin.aiUsageTitle')} — {periodLabel}
          </Text>
          <View style={styles.card}>
            <View style={styles.usageSummaryRow}>
              <View style={styles.usageStat}>
                <Text style={styles.usageStatValueLarge}>${data.aiUsage.totalEstimatedCostUsd.toFixed(2)}</Text>
                <Text style={styles.usageStatLabel}>{t('admin.estimatedCost')}</Text>
              </View>
              <View style={styles.usageStat}>
                <Text style={styles.usageStatValue}>{data.aiUsage.totalRequests}</Text>
                <Text style={styles.usageStatLabel}>
                  {t('admin.totalRequests', { count: data.aiUsage.totalRequests })}
                </Text>
              </View>
              <View style={styles.usageStat}>
                <Text style={styles.usageStatValue}>{data.aiUsage.totalCostUnits.toFixed(1)}</Text>
                <Text style={styles.usageStatLabel}>{t('admin.totalCostUnits')}</Text>
              </View>
            </View>
          </View>

          {data.aiUsage.users.length === 0 ? (
            <View style={[styles.card, { marginTop: 8 }]}>
              <Text style={styles.noUsageText}>{t('admin.noUsage')}</Text>
            </View>
          ) : (
            data.aiUsage.users.map((user) => (
              <UserUsageCard
                key={user.userId}
                user={user}
                maxCost={data.aiUsage.users[0]?.estimatedCostUsd || 1}
                styles={styles}
                theme={theme}
                t={t}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  styles,
  theme,
}: {
  icon: IconName;
  label: string;
  value: number;
  color: string;
  styles: any;
  theme: any;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TierBadge({
  tier,
  count,
  styles,
}: {
  tier: SubscriptionTier;
  count: number;
  styles: any;
}) {
  return (
    <View style={styles.tierBadge}>
      <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[tier] }]} />
      <Text style={styles.tierBadgeText}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)} ({count})
      </Text>
    </View>
  );
}

function UserUsageCard({
  user,
  maxCost,
  styles,
  theme,
  t,
}: {
  user: AdminUserUsageItem;
  maxCost: number;
  styles: any;
  theme: any;
  t: any;
}) {
  const barWidth = maxCost > 0 ? (user.estimatedCostUsd / maxCost) * 100 : 0;
  const tierColor = TIER_COLORS[user.tier] || TIER_COLORS.free;

  return (
    <View style={[styles.card, { marginTop: 8 }]}>
      <View style={styles.userHeader}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {user.userName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{user.userName}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{user.userEmail}</Text>
        </View>
        <View style={[styles.userTierBadge, { backgroundColor: tierColor + '20' }]}>
          <Ionicons name={TIER_ICONS[user.tier]} size={12} color={tierColor} />
          <Text style={[styles.userTierText, { color: tierColor }]}>
            {user.tier.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.userUsageBar}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(barWidth, 100)}%`, backgroundColor: theme.colors.primary },
            ]}
          />
        </View>
        <Text style={styles.userCostUsd}>${user.estimatedCostUsd.toFixed(3)}</Text>
      </View>

      <View style={styles.featureChips}>
        {user.byFeature.map((f) => (
          <View key={f.featureType} style={styles.featureChip}>
            <Text style={styles.featureChipText}>
              {t(FEATURE_LABELS[f.featureType] || f.featureType)}: {f.count}x (${f.estimatedCostUsd.toFixed(3)})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  errorText: { fontSize: 16, color: theme.colors.danger, marginTop: 12, textAlign: 'center' as const },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },

  card: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  statCard: {
    flex: 1,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    alignItems: 'center' as const,
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center' as const,
  },

  // Tier badges
  badgesRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  tierBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  tierDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tierBadgeText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },

  // AI Usage summary
  usageSummaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
  },
  usageStat: {
    alignItems: 'center' as const,
  },
  usageStatValueLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: theme.colors.success,
  },
  usageStatValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  usageStatLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  noUsageText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },

  // User card
  userHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  userEmail: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  userTierBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  userTierText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },

  // Usage bar
  userUsageBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  userCostUsd: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: theme.colors.success,
    minWidth: 60,
    textAlign: 'right' as const,
  },

  // Feature chips
  featureChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  featureChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  featureChipText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
});
