import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useConnectivity } from '@/hooks/useConnectivity';
import { fromDateInputValue } from '@/utils/dateInput';
import { canModifyExpense, canVoidSettlement, memberName } from '@/features/groups/groupDisplay';
import { describeGroupEvent } from '@/features/groups/groupOwnership';
import type { ActivityDay, ActivityTableRow } from '@/features/groups/groupActivityTable';
import type { GroupDetail, GroupExpense, GroupSettlement } from '@budget/shared-types';

interface Props {
  detail: GroupDetail;
  days: ActivityDay[];
  hasMore: boolean;
  loadingMore: boolean;
  /** Writes (edit, void) are offered only while the group is active. */
  canWrite: boolean;
  /** Hides the "Your share" column (below `WIDE_TABLE_MIN_WIDTH`). */
  showMyShare: boolean;
  /** The keyboard cursor row's id, or null. Only drawn while `keyboardNavEnabled`. */
  focusedRowId: string | null;
  keyboardNavEnabled: boolean;
  onFocusRow: (id: string) => void;
  onLoadMore: () => void;
  onOpenExpense: (expense: GroupExpense) => void;
  onVoidSettlement: (settlement: GroupSettlement) => void;
}

function formatDay(dayKey: string, options: Intl.DateTimeFormatOptions): string {
  const d = fromDateInputValue(dayKey, new Date()) ?? new Date(dayKey);
  return d.toLocaleDateString(undefined, options);
}

/**
 * The desktop group activity table (ABA-646): expenses and payments grouped by day, each day with an
 * expenses-only subtotal. A plain `View` in the page scroll (never a scroller of its own), with a
 * `position: sticky` header, as `TransactionTable` does.
 *
 * Actions are revealed on row hover AND on the focus of their own control, and are always
 * focusable, so a control that only ever appears under the mouse is not unreachable by keyboard.
 * A payment row is deliberately NOT a click target: a click that opens a destructive confirm is a
 * hazard with a precise pointer, so voiding is an explicit text button.
 */
export function GroupActivityTable({
  detail,
  days,
  hasMore,
  loadingMore,
  canWrite,
  showMyShare,
  focusedRowId,
  keyboardNavEnabled,
  onFocusRow,
  onLoadMore,
  onOpenExpense,
  onVoidSettlement,
}: Props) {
  const { t } = useTranslation();
  const { isOffline } = useConnectivity();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedControlId, setFocusedControlId] = useState<string | null>(null);

  const renderRow = (row: ActivityTableRow, dayKey: string) => {
    const hovered = hoveredId === row.id;
    const revealed = hovered || focusedControlId === row.id;
    const keyboardFocused = keyboardNavEnabled && focusedRowId === row.id;
    const hoverProps = {
      onHoverIn: () => setHoveredId(row.id),
      onHoverOut: () => setHoveredId((cur) => (cur === row.id ? null : cur)),
    };
    const shareCell = showMyShare ? (
      <View style={styles.cellShare}>
        <Text style={[styles.cellText, styles.alignRight, styles.tabular]}>
          {row.myShare !== null ? formatCurrency(row.myShare, detail.currencyCode) : ''}
        </Text>
      </View>
    ) : null;

    if (row.item.kind === 'expense') {
      const e = row.item.expense;
      const struck = e.deletedAt !== null;
      const editable = canWrite && !struck && canModifyExpense(detail, e);
      return (
        <Pressable
          key={row.id}
          disabled={!editable}
          onPress={() => {
            onFocusRow(row.id);
            onOpenExpense(e);
          }}
          {...hoverProps}
          accessibilityRole={editable ? 'button' : undefined}
          style={[styles.row, hovered && styles.rowHovered, keyboardFocused && styles.rowKeyboardFocused]}
        >
          <View style={styles.cellDate}>
            <Text style={styles.cellMuted}>{formatDay(dayKey, { month: 'short', day: 'numeric' })}</Text>
          </View>
          <View style={styles.cellDescription}>
            <Text style={[styles.descriptionText, struck && styles.struck]} numberOfLines={2}>
              {e.description}
            </Text>
            {struck && <Text style={styles.tag}>{t('groups.deletedTag')}</Text>}
          </View>
          <View style={styles.cellPaidBy}>
            <Text style={styles.cellText} numberOfLines={1}>
              {memberName(detail, e.paidByMemberId)}
            </Text>
          </View>
          <View style={styles.cellAmount}>
            <Text style={[styles.amountText, styles.alignRight, styles.tabular, struck && styles.struck]}>
              {formatCurrency(e.amount, detail.currencyCode)}
            </Text>
          </View>
          {shareCell}
          <View style={styles.cellActions}>
            {editable && (
              <Pressable
                onPress={() => {
                  onFocusRow(row.id);
                  onOpenExpense(e);
                }}
                onFocus={() => setFocusedControlId(row.id)}
                onBlur={() => setFocusedControlId((cur) => (cur === row.id ? null : cur))}
                accessibilityRole="button"
                accessibilityLabel={t('groups.expenseEditTitle')}
                style={{ opacity: revealed ? 1 : 0, padding: 4, borderRadius: 4 }}
              >
                <Ionicons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </Pressable>
      );
    }

    if (row.item.kind === 'event') {
      // ABA-650: a system row. No subtotal, never a keyboard target (left out of `order`), not
      // focusable and not a click target; the text spans the description, payer and amount cells.
      const text = describeGroupEvent(row.item.event);
      return (
        <View key={row.id} focusable={false} style={[styles.row, styles.eventRow]}>
          <View style={styles.cellDate}>
            <Text style={styles.cellMuted}>{formatDay(dayKey, { month: 'short', day: 'numeric' })}</Text>
          </View>
          <View style={[styles.cellDescription, styles.eventCell]}>
            <Ionicons name="people-outline" size={14} color={theme.colors.textTertiary} />
            <Text style={styles.eventText} numberOfLines={2}>
              {t(text.key, text.params)}
            </Text>
          </View>
          <View style={styles.cellActions} />
        </View>
      );
    }

    const s = row.item.settlement;
    const struck = s.voidedAt !== null;
    const voidable = canWrite && !struck && canVoidSettlement(detail, s);
    return (
      <Pressable
        key={row.id}
        // Not a click target on purpose (see the component comment): no `onPress`, out of the tab
        // order and the accessibility tree. It is a Pressable only because a plain View receives
        // no hover events on react-native-web, and the Void button below reveals on row hover.
        {...hoverProps}
        focusable={false}
        accessible={false}
        style={[
          styles.row,
          { cursor: 'default' } as object,
          hovered && styles.rowHovered,
          keyboardFocused && styles.rowKeyboardFocused,
        ]}
      >
        <View style={styles.cellDate}>
          <Text style={styles.cellMuted}>{formatDay(dayKey, { month: 'short', day: 'numeric' })}</Text>
        </View>
        <View style={styles.cellDescription}>
          <Text style={[styles.descriptionText, struck && styles.struck]} numberOfLines={2}>
            {t('groups.paymentLabel')}:{' '}
            {t('groups.transferRow', {
              from: memberName(detail, s.fromMemberId),
              to: memberName(detail, s.toMemberId),
            })}
          </Text>
          {struck && <Text style={styles.tag}>{t('groups.voidedTag')}</Text>}
        </View>
        <View style={styles.cellPaidBy}>
          <Text style={styles.cellText} numberOfLines={1}>
            {memberName(detail, s.fromMemberId)}
          </Text>
        </View>
        <View style={styles.cellAmount}>
          <Text style={[styles.amountText, styles.alignRight, styles.tabular, struck && styles.struck]}>
            {formatCurrency(s.amount, detail.currencyCode)}
          </Text>
        </View>
        {shareCell}
        <View style={styles.cellActions}>
          {voidable && (
            <Pressable
              onPress={() => onVoidSettlement(s)}
              disabled={isOffline}
              accessibilityHint={isOffline ? t('groups.offlineBanner') : undefined}
              onFocus={() => setFocusedControlId(row.id)}
              onBlur={() => setFocusedControlId((cur) => (cur === row.id ? null : cur))}
              accessibilityRole="button"
              style={{ opacity: revealed ? (isOffline ? 0.55 : 1) : 0, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 }}
            >
              <Text style={styles.voidText}>{t('groups.voidPayment')}</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <View style={styles.cellDate}>
          <Text style={styles.headerText}>{t('expensesDesktop.colDate')}</Text>
        </View>
        <View style={styles.cellDescription}>
          <Text style={styles.headerText}>{t('expensesDesktop.colDescription')}</Text>
        </View>
        <View style={styles.cellPaidBy}>
          <Text style={styles.headerText}>{t('groups.paidByLabel')}</Text>
        </View>
        <View style={styles.cellAmount}>
          <Text style={[styles.headerText, styles.alignRight]}>{t('expensesDesktop.colAmount')}</Text>
        </View>
        {showMyShare && (
          <View style={styles.cellShare}>
            <Text style={[styles.headerText, styles.alignRight]}>{t('groups.colMyShare')}</Text>
          </View>
        )}
        <View style={styles.cellActions} />
      </View>

      {days.length === 0 ? (
        <Text style={styles.empty}>{t('groups.activityEmpty')}</Text>
      ) : (
        days.map((day) => (
          <View key={day.dayKey}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>
                {formatDay(day.dayKey, { year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.daySubtotal, styles.tabular]}>
                {day.subtotal > 0 ? formatCurrency(day.subtotal, detail.currencyCode) : '—'}
              </Text>
            </View>
            {day.rows.map((r) => renderRow(r, day.dayKey))}
          </View>
        ))
      )}

      {hasMore &&
        (loadingMore ? (
          <ActivityIndicator style={styles.more} color={theme.colors.primary} />
        ) : (
          <Pressable style={styles.more} onPress={onLoadMore} accessibilityRole="button">
            <Text style={styles.moreText}>{t('groups.loadMore')}</Text>
          </Pressable>
        ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  table: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: theme.spacing[2],
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    // Sticks to the top of the ONE page scroll. Opaque and above the rows. Web-only.
    position: 'sticky' as unknown as 'absolute',
    top: 0,
    zIndex: 2,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
  },
  headerText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  dayHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    marginTop: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  dayLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  daySubtotal: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    // Reserved so the keyboard-cursor mark never shifts the row's width.
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowKeyboardFocused: {
    borderLeftColor: theme.colors.primary,
  },
  cellDate: { width: 64 },
  cellDescription: { flex: 1, minWidth: 140, paddingRight: theme.spacing[2] },
  cellPaidBy: { width: 110, paddingRight: theme.spacing[2] },
  cellAmount: { width: 110 },
  cellShare: { width: 110 },
  cellActions: { width: 64, alignItems: 'flex-end' as const },
  alignRight: { textAlign: 'right' as const },
  tabular: { fontVariant: ['tabular-nums' as const] },
  descriptionText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  amountText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  cellText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  cellMuted: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  tag: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  eventRow: {
    cursor: 'default',
  } as object,
  eventCell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  eventText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  voidText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.danger,
  },
  struck: {
    textDecorationLine: 'line-through' as const,
    color: theme.colors.textTertiary,
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    padding: theme.spacing[4],
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
