import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { useAccountStore } from '@/stores/accountStore';
import type { FeedGroup } from '@budget/shared-types';

// Color + icon per event type — makes each bubble self-explanatory at a glance
const TYPE_META: Record<string, { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  expenses:                    { color: '#EF4444', icon: 'arrow-down' },
  incomes:                     { color: '#10B981', icon: 'arrow-up' },
  purchase_request_created:    { color: '#F59E0B', icon: 'cart-outline' },
  purchase_request_approved:   { color: '#10B981', icon: 'checkmark-circle' },
  purchase_request_purchased:  { color: '#6366F1', icon: 'bag-check-outline' },
  purchase_request_rejected:   { color: '#EF4444', icon: 'close-circle' },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { color: '#6B7280', icon: 'ellipsis-horizontal' as const };
}

function StoryBubble({ group }: { group: FeedGroup }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const { color, icon } = typeMeta(group.type);
  const isPR = group.type.startsWith('purchase_request');

  // Line 1: colored amount (PR shows its own amount, expenses/incomes show total with sign)
  const amountLabel = isPR
    ? group.purchaseRequest?.amount != null && group.purchaseRequest?.currency
      ? formatCurrency(group.purchaseRequest.amount, group.purchaseRequest.currency)
      : t('familyFeed.purchaseShort')
    : group.totalAmount != null && group.currency
    ? `${group.type === 'expenses' ? '−' : '+'}${formatCurrency(group.totalAmount, group.currency)}`
    : `×${group.count}`;

  // Line 2: type label — for PRs reflects current status (approved/rejected/pending)
  const typeLabel = !isPR
    ? t(group.type === 'expenses' ? 'familyFeed.typeExpense' : 'familyFeed.typeIncome')
    : group.type === 'purchase_request_approved'
    ? t('familyFeed.purchaseApproved')
    : group.type === 'purchase_request_purchased'
    ? t('familyFeed.purchaseMade')
    : group.type === 'purchase_request_rejected'
    ? t('familyFeed.purchaseRejected')
    : t('familyFeed.purchaseShort');

  const handlePress = () => {
    if (isPR && group.purchaseRequest?.id) {
      router.push(`/purchase-requests/${group.purchaseRequest.id}` as any);
    } else if (group.count === 1 && group.eventIds?.length === 1) {
      router.push(
        (group.type === 'expenses'
          ? `/expense/${group.eventIds[0]}`
          : `/income/${group.eventIds[0]}`) as any,
      );
    } else {
      router.push('/family-feed' as any);
    }
  };

  return (
    <TouchableOpacity
      style={s.bubble}
      onPress={handlePress}
      activeOpacity={0.72}
    >
      {/* Avatar: colored ring + tinted background + person letter */}
      <View style={s.avatarWrapper}>
        <View style={[s.ring, { borderColor: color }]}>
          <View style={[s.avatar, { backgroundColor: color + '20' }]}>
            <Text style={[s.initial, { color: theme.colors.textPrimary }]}>
              {group.userName.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
        {/* Type badge — small circle with icon at bottom-right */}
        <View style={[s.badge, { backgroundColor: color }]}>
          <Ionicons name={icon} size={9} color="#fff" />
        </View>
      </View>

      {/* Name */}
      <Text style={[s.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
        {group.userName.split(' ')[0]}
      </Text>

      {/* Amount in type color */}
      <Text style={[s.amount, { color }]} numberOfLines={1}>
        {amountLabel}
      </Text>

      {/* Type label — explicit text so the user never has to guess */}
      <Text style={[s.typeLabel, { color }]} numberOfLines={1}>
        {typeLabel}
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

// Static styles (no theme dependency) for StoryBubble
const s = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    width: 72,
    marginRight: 14,
  },
  avatarWrapper: {
    width: 56,
    height: 56,
    position: 'relative',
  },
  ring: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 19,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    // white border so it separates from the ring on any background
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  name: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
    width: 70,
  },
  amount: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
    width: 70,
  },
  typeLabel: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
    textAlign: 'center',
    width: 70,
    opacity: 0.85,
  },
});

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      borderRadius: 16,
      borderWidth: 1,
      paddingTop: 14,
      paddingBottom: 16,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
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
