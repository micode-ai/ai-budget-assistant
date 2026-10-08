import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { fromDateInputValue } from '@/utils/dateInput';
import { canModifyExpense, canVoidSettlement, memberName } from '@/features/groups/groupDisplay';
import type {
  GroupActivityItem,
  GroupDetail,
  GroupExpense,
  GroupSettlement,
} from '@budget/shared-types';

interface GroupActivityListProps {
  detail: GroupDetail;
  items: GroupActivityItem[];
  hasMore: boolean;
  loadingMore: boolean;
  /** Writes (edit, void) are offered only while the group is active. */
  canWrite: boolean;
  onLoadMore: () => void;
  onOpenExpense: (expense: GroupExpense) => void;
  onVoidSettlement: (settlement: GroupSettlement) => void;
}

function formatDay(dateOnly: string): string {
  const d = fromDateInputValue(dateOnly, new Date());
  return (d ?? new Date(dateOnly)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Expenses and payments, newest first. Deleted / voided rows stay visible, struck through. */
export function GroupActivityList({
  detail,
  items,
  hasMore,
  loadingMore,
  canWrite,
  onLoadMore,
  onOpenExpense,
  onVoidSettlement,
}: GroupActivityListProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('groups.activityTitle')}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{t('groups.activityEmpty')}</Text>
      ) : (
        items.map((item) => {
          if (item.kind === 'expense') {
            const e = item.expense;
            const struck = e.deletedAt !== null;
            const editable = canWrite && !struck && canModifyExpense(detail, e);
            return (
              <TouchableOpacity
                key={`e-${e.id}`}
                style={styles.row}
                disabled={!editable}
                onPress={() => onOpenExpense(e)}
                activeOpacity={0.7}
              >
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowTitle, struck && styles.struck]} numberOfLines={2}>
                    {e.description}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {t('groups.paidBy', { payer: memberName(detail, e.paidByMemberId) })} · {formatDay(e.date)}
                    {struck ? ` · ${t('groups.deletedTag')}` : ''}
                  </Text>
                </View>
                <Text style={[styles.rowAmount, struck && styles.struck]}>
                  {formatCurrency(e.amount, detail.currencyCode)}
                </Text>
              </TouchableOpacity>
            );
          }

          const s = item.settlement;
          const struck = s.voidedAt !== null;
          const voidable = canWrite && !struck && canVoidSettlement(detail, s);
          return (
            <TouchableOpacity
              key={`s-${s.id}`}
              style={styles.row}
              disabled={!voidable}
              onPress={() => onVoidSettlement(s)}
              activeOpacity={0.7}
            >
              <View style={styles.rowInfo}>
                <Text style={[styles.rowTitle, struck && styles.struck]} numberOfLines={2}>
                  {t('groups.paymentLabel')}:{' '}
                  {t('groups.transferRow', {
                    from: memberName(detail, s.fromMemberId),
                    to: memberName(detail, s.toMemberId),
                  })}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {new Date(s.createdAt).toLocaleDateString()}
                  {struck ? ` · ${t('groups.voidedTag')}` : ''}
                </Text>
              </View>
              <Text style={[styles.rowAmount, struck && styles.struck]}>
                {formatCurrency(s.amount, detail.currencyCode)}
              </Text>
            </TouchableOpacity>
          );
        })
      )}
      {hasMore &&
        (loadingMore ? (
          <ActivityIndicator style={styles.more} color={theme.colors.primary} />
        ) : (
          <TouchableOpacity style={styles.more} onPress={onLoadMore}>
            <Text style={styles.moreText}>{t('groups.loadMore')}</Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  rowMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  struck: {
    textDecorationLine: 'line-through' as const,
    color: theme.colors.textTertiary,
  },
  more: {
    alignItems: 'center' as const,
    paddingTop: theme.spacing[3],
  },
  moreText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
