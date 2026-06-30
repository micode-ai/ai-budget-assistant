import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { useAccountStore } from '@/stores/accountStore';
import type { FeedGroup } from '@budget/shared-types';

const RING_COLORS = {
  expenses: '#EF4444',
  incomes: '#10B981',
  purchase_request_created: '#F59E0B',
  purchase_request_approved: '#10B981',
  purchase_request_purchased: '#6366F1',
} as const;

function ringColor(type: string): string {
  return (RING_COLORS as Record<string, string>)[type] ?? '#6B7280';
}

function StoryBubble({ group }: { group: FeedGroup }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const isPR = group.type.startsWith('purchase_request');
  const label = isPR
    ? t('familyFeed.purchaseShort')
    : group.totalAmount != null && group.currency
    ? formatCurrency(group.totalAmount, group.currency)
    : `×${group.count}`;

  return (
    <TouchableOpacity
      style={bubbleStyles.bubble}
      onPress={() => router.push('/family-feed' as any)}
      activeOpacity={0.75}
    >
      <View style={[bubbleStyles.ringWrap, { borderColor: ringColor(group.type) }]}>
        <View style={[bubbleStyles.avatar, { backgroundColor: theme.colors.primary + '22' }]}>
          <Text style={[bubbleStyles.avatarLetter, { color: theme.colors.primary }]}>
            {group.userName.charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={[bubbleStyles.bubbleName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
        {group.userName.split(' ')[0]}
      </Text>
      <Text style={[bubbleStyles.bubbleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function FamilyFeedWidget() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const theme = useTheme();
  const router = useRouter();
  const { groups, loadFeed } = useFamilyFeedStore();
  const currentAccountId = useAccountStore((s) => s.currentAccount()?.id);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed, currentAccountId]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{t('familyFeed.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/family-feed' as any)}>
          <Text style={[styles.showAll, { color: theme.colors.primary }]}>{t('familyFeed.showAll')}</Text>
        </TouchableOpacity>
      </View>

      {groups.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>{t('familyFeed.noActivity')}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {groups.slice(0, 10).map((group) => (
            <StoryBubble key={group.id} group={group} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    width: 68,
    marginRight: 12,
  },
  ringWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '700',
  },
  bubbleName: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
    textAlign: 'center',
    width: 64,
  },
  bubbleLabel: {
    fontSize: 10,
    marginTop: 1,
    textAlign: 'center',
    width: 64,
  },
});

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      borderRadius: 16,
      borderWidth: 1,
      paddingTop: 14,
      paddingBottom: 14,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
    },
    showAll: {
      fontSize: 14,
    },
    scroll: {
      paddingRight: 4,
    },
    empty: {
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 8,
    },
  });
