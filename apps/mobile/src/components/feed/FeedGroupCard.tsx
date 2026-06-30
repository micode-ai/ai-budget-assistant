import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { EmojiReactionBar } from './EmojiReactionBar';
import type { FeedGroup } from '@budget/shared-types';

interface FeedGroupCardProps {
  group: FeedGroup;
}

export function FeedGroupCard({ group }: FeedGroupCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { react, removeReaction } = useFamilyFeedStore();
  const baseCurrency = useAuthStore((s) => s.user?.currencyCode) ?? 'USD';
  const [expanded, setExpanded] = useState(false);

  const isToday = group.date === new Date().toISOString().slice(0, 10);
  const isYesterday =
    group.date ===
    new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateLabel = isToday
    ? t('familyFeed.today')
    : isYesterday
    ? t('familyFeed.yesterday')
    : group.date;

  const isPR =
    group.type === 'purchase_request_created' ||
    group.type === 'purchase_request_approved' ||
    group.type === 'purchase_request_purchased';

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '33' }]}>
          <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
            {group.userName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>{group.userName}</Text>
          <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>{dateLabel}</Text>
        </View>
        {isPR && group.purchaseRequest && (
          <View style={[styles.statusBadge, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
              {group.type === 'purchase_request_approved'
                ? t('familyFeed.purchaseApproved')
                : group.type === 'purchase_request_purchased'
                ? t('familyFeed.purchaseMade')
                : 'PENDING'}
            </Text>
          </View>
        )}
      </View>

      {/* Body */}
      {isPR && group.purchaseRequest ? (
        <TouchableOpacity
          onPress={() => router.push(`/purchase-requests/${group.purchaseRequest!.id}` as any)}
          style={styles.body}
        >
          <Text style={[styles.bodyTitle, { color: theme.colors.textPrimary }]}>
            {group.userName} {t('familyFeed.proposedPurchase')}
          </Text>
          <Text style={[styles.bodyAmount, { color: theme.colors.textPrimary }]}>
            {group.purchaseRequest.title} ·{' '}
            {formatCurrency(group.purchaseRequest.amount, group.purchaseRequest.currency)}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.body}>
          {group.count === 1 && group.eventIds ? (
            <TouchableOpacity
              onPress={() =>
                router.push(
                  (group.type === 'expenses'
                    ? `/expense/${group.eventIds![0]}`
                    : `/income/${group.eventIds![0]}`) as any,
                )
              }
            >
              <Text style={[styles.bodyAmount, { color: theme.colors.textPrimary }]}>
                {formatCurrency(group.totalAmount ?? 0, group.currency ?? baseCurrency)}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={[styles.bodyAmount, { color: theme.colors.textPrimary }]}>
                {t(group.type === 'expenses' ? 'familyFeed.expenses' : 'familyFeed.incomes', {
                  count: group.count,
                  amount: formatCurrency(group.totalAmount ?? 0, group.currency ?? baseCurrency),
                })}
              </Text>
              <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.expandBtn}>
                <Text style={[styles.expandText, { color: theme.colors.primary }]}>
                  {expanded ? t('familyFeed.collapse') : t('familyFeed.expand')}
                </Text>
              </TouchableOpacity>
              {expanded && group.eventIds && (
                <View style={styles.expandedList}>
                  {group.eventIds.map((eid) => (
                    <TouchableOpacity
                      key={eid}
                      onPress={() =>
                        router.push((group.type === 'expenses' ? `/expense/${eid}` : `/income/${eid}`) as any)
                      }
                    >
                      <Text style={[styles.expandedRow, { color: theme.colors.textSecondary }]}>· {eid}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Reactions */}
      <EmojiReactionBar
        eventId={group.id}
        reactions={group.reactions}
        myReaction={group.myReaction}
        onReact={react}
        onRemove={removeReaction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '600' },
  headerText: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600' },
  dateLabel: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11 },
  body: { marginBottom: 4 },
  bodyTitle: { fontSize: 13, marginBottom: 2 },
  bodyAmount: { fontSize: 15, fontWeight: '600' },
  expandBtn: { marginTop: 4 },
  expandText: { fontSize: 13 },
  expandedList: { marginTop: 4, gap: 2 },
  expandedRow: { fontSize: 13 },
});
