import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useReferralStore } from '@/stores/referralStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ReferralListItemDto } from '@budget/shared-types';

export default function ReferralScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { code, stats, referrals, isLoading, loadStats, loadReferrals, copyCode, shareCode } =
    useReferralStore();

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadReferrals();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadReferrals()]);
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    const success = await copyCode();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    await shareCode();
  };

  const getStatusColor = (status: ReferralListItemDto['status']) => {
    switch (status) {
      case 'qualified':
        return theme.colors.success;
      case 'pending':
        return theme.colors.warning;
      case 'expired':
        return theme.colors.textTertiary;
    }
  };

  const milestoneProgress =
    stats && stats.nextMilestone
      ? Math.min((stats.qualifiedReferrals / stats.nextMilestone.count) * 100, 100)
      : 100;

  const renderReferral = ({ item }: { item: ReferralListItemDto }) => {
    const statusColor = getStatusColor(item.status);
    return (
      <View style={styles.referralRow}>
        <View style={styles.referralAvatar}>
          <Ionicons name="person-outline" size={18} color={theme.colors.textSecondary} />
        </View>
        <View style={styles.referralInfo}>
          <Text style={styles.referralName}>{item.referredName}</Text>
          <Text style={styles.referralDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {t(`referral.status.${item.status}`)}
          </Text>
        </View>
      </View>
    );
  };

  const ListHeader = (
    <View>
      {/* Code Card */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>{t('referral.yourCode')}</Text>
        <Text style={styles.codeValue}>{code ?? '—'}</Text>
        <View style={styles.codeButtons}>
          <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
            <Ionicons
              name={copied ? 'checkmark-outline' : 'copy-outline'}
              size={18}
              color={theme.colors.primary}
            />
            <Text style={styles.copyButtonText}>
              {copied ? t('referral.copied') : t('referral.copy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.shareButtonText}>{t('referral.share')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Row */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalReferrals}</Text>
            <Text style={styles.statLabel}>{t('referral.stats.total')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>
              {stats.qualifiedReferrals}
            </Text>
            <Text style={styles.statLabel}>{t('referral.stats.qualified')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.warning }]}>
              {stats.pendingReferrals}
            </Text>
            <Text style={styles.statLabel}>{t('referral.stats.pending')}</Text>
          </View>
        </View>
      )}

      {/* Bonus AI Requests */}
      {stats && (
        <View style={styles.bonusCard}>
          <View style={styles.bonusRow}>
            <View style={[styles.bonusIcon, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name="sparkles-outline" size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.bonusInfo}>
              <Text style={styles.bonusTitle}>{t('referral.bonusAiRequests')}</Text>
              <Text style={styles.bonusValue}>
                +{stats.bonusAiRequests} {t('referral.requests')}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Milestone Progress */}
      {stats && stats.nextMilestone && (
        <View style={styles.milestoneCard}>
          <View style={styles.milestoneHeader}>
            <Text style={styles.milestoneTitle}>{t('referral.nextMilestone')}</Text>
            <Text style={styles.milestoneReward}>{t(`referral.reward.${stats.nextMilestone.reward}`)}</Text>
          </View>
          <View style={styles.milestoneProgress}>
            <Text style={styles.milestoneCount}>
              {stats.qualifiedReferrals} / {stats.nextMilestone.count}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${milestoneProgress}%` as any,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* How It Works */}
      <View style={styles.howItWorksCard}>
        <View style={styles.howItWorksHeader}>
          <Ionicons name="information-circle-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.howItWorksTitle}>{t('referral.howItWorks.title')}</Text>
        </View>
        <View style={styles.howItWorksStep}>
          <Text style={styles.howItWorksNumber}>1</Text>
          <Text style={styles.howItWorksText}>{t('referral.howItWorks.step1')}</Text>
        </View>
        <View style={styles.howItWorksStep}>
          <Text style={styles.howItWorksNumber}>2</Text>
          <Text style={styles.howItWorksText}>{t('referral.howItWorks.step2')}</Text>
        </View>
        <View style={styles.howItWorksStep}>
          <Text style={styles.howItWorksNumber}>3</Text>
          <Text style={styles.howItWorksText}>{t('referral.howItWorks.step3')}</Text>
        </View>
      </View>

      {/* Referrals List Header */}
      <Text style={styles.sectionTitle}>{t('referral.referredUsers')}</Text>

      {isLoading && (
        <ActivityIndicator
          size="small"
          color={theme.colors.primary}
          style={styles.loader}
        />
      )}
    </View>
  );

  const ListEmpty = !isLoading ? (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={48} color={theme.colors.textTertiary} />
      <Text style={styles.emptyTitle}>{t('referral.empty.title')}</Text>
      <Text style={styles.emptySubtitle}>{t('referral.empty.subtitle')}</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen options={{ title: t('referral.title'), headerShown: true }} />
      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        renderItem={renderReferral}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },

  // Code card
  codeCard: {
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    letterSpacing: 4,
    marginBottom: 16,
  },
  codeButtons: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  copyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  shareButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: 4,
  },

  // Bonus card
  bonusCard: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 16,
  },
  bonusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  bonusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bonusInfo: {
    flex: 1,
  },
  bonusTitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  bonusValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: theme.colors.primary,
  },

  // Milestone card
  milestoneCard: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 24,
  },
  milestoneHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  milestoneTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  milestoneReward: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  milestoneProgress: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    marginBottom: 6,
  },
  milestoneCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
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

  // How it works
  howItWorksCard: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 24,
  },
  howItWorksHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 12,
  },
  howItWorksTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  howItWorksStep: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    marginBottom: 8,
  },
  howItWorksNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary + '20',
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    lineHeight: 22,
  },
  howItWorksText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },

  // Section title
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  loader: {
    marginVertical: 16,
  },

  // Referral row
  referralRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  referralAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.progressTrack,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  referralDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },

  // Empty state
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: 32,
  },
});
