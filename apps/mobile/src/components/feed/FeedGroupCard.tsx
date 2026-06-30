import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import { EmojiReactionBar } from './EmojiReactionBar';
import type { FeedGroup } from '@budget/shared-types';

// Per-type accent color (matches widget colors exactly)
const TYPE_COLOR: Record<string, string> = {
  expenses:                    '#EF4444',
  incomes:                     '#10B981',
  purchase_request_created:    '#F59E0B',
  purchase_request_approved:   '#10B981',
  purchase_request_purchased:  '#6366F1',
};

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  expenses:                    'arrow-down-circle',
  incomes:                     'arrow-up-circle',
  purchase_request_created:    'cart-outline',
  purchase_request_approved:   'checkmark-circle',
  purchase_request_purchased:  'bag-check-outline',
};

// PR status pill colors
const STATUS_COLOR: Record<string, string> = {
  PENDING:  '#F59E0B',
  APPROVED: '#10B981',
  PURCHASED:'#6366F1',
  REJECTED: '#EF4444',
};

function typeColor(t: string) {
  return TYPE_COLOR[t] ?? '#6B7280';
}
function typeIcon(t: string): React.ComponentProps<typeof Ionicons>['name'] {
  return TYPE_ICON[t] ?? 'ellipsis-horizontal';
}

interface Props {
  group: FeedGroup;
}

export function FeedGroupCard({ group }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { react, removeReaction } = useFamilyFeedStore();
  const baseCurrency = useAuthStore((s) => s.user?.currencyCode) ?? 'USD';
  const [expanded, setExpanded] = useState(false);

  const color = typeColor(group.type);
  const icon  = typeIcon(group.type);
  const isPR  = group.type.startsWith('purchase_request');

  // Relative date label
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateLabel = group.date === today
    ? t('familyFeed.today')
    : group.date === yesterday
    ? t('familyFeed.yesterday')
    : new Date(group.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  // Type pill label
  const typeLabel = isPR
    ? t('familyFeed.typeRequest')
    : t(group.type === 'expenses' ? 'familyFeed.typeExpense' : 'familyFeed.typeIncome');

  // Amount with sign
  const sign = group.type === 'expenses' ? '−' : group.type === 'incomes' ? '+' : '';
  const amountStr = group.totalAmount != null && group.currency
    ? `${sign}${formatCurrency(group.totalAmount, group.currency)}`
    : '';

  // PR status chip
  const prStatus  = group.purchaseRequest?.status ?? 'PENDING';
  const prColor   = STATUS_COLOR[prStatus] ?? '#6B7280';
  const prStatusLabel =
    prStatus === 'APPROVED' ? t('familyFeed.purchaseApproved') :
    prStatus === 'PURCHASED'? t('familyFeed.purchaseMade') :
    prStatus === 'REJECTED' ? t('familyFeed.purchaseRejected') :
    t('familyFeed.purchaseShort');

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
          borderLeftColor: color,
        },
      ]}
    >
      {/* ── Header: avatar + name/date + type pill ─────────────────── */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: color + '20' }]}>
          <Text style={[styles.avatarLetter, { color }]}>
            {group.userName.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.headerMeta}>
          <Text style={[styles.userName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {group.userName}
          </Text>
          <Text style={[styles.dateText, { color: theme.colors.textTertiary }]}>
            {dateLabel}
          </Text>
        </View>

        {/* Type pill */}
        <View style={[styles.typePill, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={11} color={color} />
          <Text style={[styles.typePillText, { color }]}>{typeLabel}</Text>
        </View>
      </View>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {isPR && group.purchaseRequest ? (
        /* Purchase request card */
        <TouchableOpacity
          style={styles.body}
          onPress={() => router.push(`/purchase-requests/${group.purchaseRequest!.id}` as any)}
          activeOpacity={0.7}
        >
          <View style={styles.prRow}>
            <Text style={[styles.prTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
              {group.purchaseRequest.title}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
          </View>
          <View style={styles.prMeta}>
            <Text style={[styles.prAmount, { color: theme.colors.textPrimary }]}>
              {formatCurrency(group.purchaseRequest.amount, group.purchaseRequest.currency)}
            </Text>
            <View style={[styles.statusChip, { backgroundColor: prColor + '1A' }]}>
              <View style={[styles.statusDot, { backgroundColor: prColor }]} />
              <Text style={[styles.statusText, { color: prColor }]}>{prStatusLabel}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        /* Expense / income card */
        <View style={styles.body}>
          {/* Main amount */}
          {amountStr ? (
            <Text style={[styles.amount, { color }]}>{amountStr}</Text>
          ) : null}

          {/* Single item → direct deep-link */}
          {group.count === 1 && group.eventIds?.length === 1 ? (
            <TouchableOpacity
              style={styles.singleRow}
              onPress={() =>
                router.push(
                  (group.type === 'expenses'
                    ? `/expense/${group.eventIds![0]}`
                    : `/income/${group.eventIds![0]}`) as any,
                )
              }
              activeOpacity={0.7}
            >
              <Text style={[styles.singleLabel, { color: theme.colors.textSecondary }]}>
                {t(group.type === 'expenses' ? 'familyFeed.typeExpense' : 'familyFeed.typeIncome')}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          ) : group.count && group.count > 1 ? (
            /* Multiple items → collapsible list */
            <>
              <TouchableOpacity
                style={styles.expandToggle}
                onPress={() => setExpanded((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.expandCount, { color: theme.colors.textSecondary }]}>
                  {t(group.type === 'expenses' ? 'familyFeed.expenses' : 'familyFeed.incomes', {
                    count: group.count,
                    amount: amountStr,
                  })}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>

              {expanded && group.eventIds && (
                <View style={styles.expandedList}>
                  {group.eventIds.map((eid, idx) => (
                    <TouchableOpacity
                      key={eid}
                      style={[
                        styles.expandedItem,
                        { borderTopColor: theme.colors.divider },
                      ]}
                      onPress={() =>
                        router.push(
                          (group.type === 'expenses'
                            ? `/expense/${eid}`
                            : `/income/${eid}`) as any,
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.expandedNum, { color }]}>
                        {idx + 1}
                      </Text>
                      <Text style={[styles.expandedLinkText, { color: theme.colors.textSecondary }]}>
                        {t(
                          group.type === 'expenses'
                            ? 'familyFeed.typeExpense'
                            : 'familyFeed.typeIncome',
                        )}
                      </Text>
                      <Ionicons name="chevron-forward" size={13} color={theme.colors.textTertiary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : null}
        </View>
      )}

      {/* ── Reactions ──────────────────────────────────────────────── */}
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
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    marginTop: 1,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Body (shared)
  body: {
    marginBottom: 8,
  },

  // Expense/income: amount
  amount: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },

  // Single item tap row
  singleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  singleLabel: {
    fontSize: 13,
  },

  // Multi-item expand toggle
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandCount: {
    fontSize: 13,
    flex: 1,
  },

  // Expanded item list
  expandedList: {
    marginTop: 8,
    gap: 0,
  },
  expandedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandedNum: {
    fontSize: 13,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  expandedLinkText: {
    fontSize: 13,
    flex: 1,
  },

  // Purchase request body
  prRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 8,
  },
  prTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  prMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  prAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
