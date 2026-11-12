import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { ChildMonthRow } from '@/features/children/useChildCosts';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  /** Non-archived children only; the caller renders nothing when this is empty. */
  rows: ChildMonthRow[];
  currency: string;
  /** `section` (phone): an h3 title above a card, like the other Analytics sections.
   *  `card` (desktop `BreakdownGrid` tile): the title inside a `BreakdownCard`-style surface. */
  variant: 'section' | 'card';
}

/**
 * The Analytics "Children" entry: each child with this month's total, linking
 * to their costs. A list, never a donut and never a percentage column — a
 * share of the total would invite comparing children. Rows stay in name order.
 * A total still loading reads "—", never 0.
 */
export function ChildrenAnalyticsCard({ rows, currency, variant }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const list = (
    <View style={styles.surface}>
      {variant === 'card' && <Text style={styles.cardTitle}>{t('childCosts.analyticsTitle')}</Text>}
      <View style={styles.captionRow}>
        <Text style={styles.caption}>{t('childCosts.thisMonth')}</Text>
        <Pressable onPress={() => router.push('/children')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.allLink}>{t('childCosts.allChildren')}</Text>
        </Pressable>
      </View>
      {rows.map((row, i) => (
        <ChildMonthLink key={row.child.id} row={row} currency={currency} first={i === 0} />
      ))}
      {rows.some((r) => r.fxApproximate) && <Text style={styles.fxNote}>{t('childCosts.fxApproximate')}</Text>}
    </View>
  );
  if (variant === 'card') return list;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('childCosts.analyticsTitle')}</Text>
      {list}
    </View>
  );
}

function ChildMonthLink({ row, currency, first }: { row: ChildMonthRow; currency: string; first: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);
  const name = row.child.name || t('children.unnamed');
  // "≈": some of this child's amounts have no exchange rate and are left out (caption below the list).
  const amount =
    row.monthTotal === null ? '—' : `${row.fxApproximate ? '≈ ' : ''}${formatCurrency(row.monthTotal, currency)}`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/children/[id]', params: { id: row.child.id } })}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={`${name}, ${t('childCosts.thisMonth')}: ${amount}${row.fxApproximate ? `. ${t('childCosts.fxApproximate')}` : ''}`}
      style={[styles.row, !first && styles.rowDivider, hovered && styles.rowHover]}
    >
      <View style={[styles.dot, { backgroundColor: row.child.color || theme.colors.primary }]} />
      <Text style={styles.rowName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.rowAmount}>{amount}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[5] },
  sectionTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  surface: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[1] },
  captionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  caption: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  fxNote: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginTop: theme.spacing[2] },
  allLink: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 44,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  rowHover: { backgroundColor: theme.colors.surfaceSecondary },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
});
