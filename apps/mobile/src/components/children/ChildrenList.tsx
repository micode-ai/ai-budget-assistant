import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { useChildrenMonthTotals, type ChildMonthRow } from '@/features/children/useChildCosts';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';

/** The settings form pane's width: one surface card, not a full-window table. */
const DESKTOP_MAX_WIDTH = 720;

/**
 * `/children`: every child of the account with this month's total, archived
 * children under a collapsed "Archived" disclosure (their screens still work).
 * Rows are in name order and never ranked; each whole row links to the
 * child's costs. One component for phone and desktop: the desktop spec asks
 * only for a width cap and denser rows, which a style switch covers.
 *
 * Names and adding live in Settings → Children (the existing manage flow).
 */
export function ChildrenList() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { active, archived, loading, error, retry, currency, childrenLoaded } = useChildrenMonthTotals();
  const [showArchived, setShowArchived] = useState(false);

  const manage = () => router.push('/settings/children');
  const total = active.length + archived.length;

  let body: React.ReactNode;
  if (error && total === 0) {
    body = (
      <View style={styles.state}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.colors.textTertiary} />
        <Text style={styles.stateText}>{t('children.loadFailed')}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={retry} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!childrenLoaded && total === 0) {
    body = (
      <View style={styles.state}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  } else if (total === 0) {
    body = (
      <View style={styles.state}>
        <Ionicons name="people-outline" size={40} color={theme.colors.textTertiary} />
        <Text style={styles.stateText}>{t('children.empty')}</Text>
        {canEdit && (
          <TouchableOpacity style={styles.primaryButton} onPress={manage} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>{t('childCosts.addFirst')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else {
    body = (
      <>
        <View style={styles.headerRow}>
          <Text style={styles.columnLabel}>{t('childCosts.thisMonth')}</Text>
          {canEdit && (
            <TouchableOpacity onPress={manage} accessibilityRole="button" style={styles.manage}>
              <Ionicons name="settings-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.manageText}>{t('childCosts.manage')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {active.length > 0 && (
          <View style={styles.card}>
            {active.map((row, i) => (
              <ChildRow key={row.child.id} row={row} currency={currency} first={i === 0} dense={isDesktop} />
            ))}
          </View>
        )}
        {[...active, ...archived].some((r) => r.fxApproximate) && (
          <Text style={styles.fxNote}>{t('childCosts.fxApproximate')}</Text>
        )}
        {error && (
          <TouchableOpacity onPress={retry} accessibilityRole="button">
            <Text style={styles.inlineError}>{`${t('childCosts.loadFailed')} · ${t('common.retry')}`}</Text>
          </TouchableOpacity>
        )}
        {loading && !error && <Text style={styles.loadingNote}>{t('common.loading')}</Text>}
        {archived.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.disclosure}
              onPress={() => setShowArchived((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
            >
              <Ionicons
                name={showArchived ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.disclosureText}>
                {t('children.archivedSection', { count: archived.length })}
              </Text>
            </TouchableOpacity>
            {showArchived && (
              <View style={[styles.card, styles.muted]}>
                {archived.map((row, i) => (
                  <ChildRow key={row.child.id} row={row} currency={currency} first={i === 0} dense={isDesktop} />
                ))}
              </View>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: theme.spacing[8] + insets.bottom },
        isDesktop && styles.contentDesktop,
      ]}
    >
      {body}
    </ScrollView>
  );
}

function ChildRow({
  row,
  currency,
  first,
  dense,
}: {
  row: ChildMonthRow;
  currency: string;
  first: boolean;
  dense: boolean;
}) {
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
      style={[styles.row, dense && styles.rowDense, !first && styles.rowDivider, hovered && styles.rowHover]}
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
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], gap: theme.spacing[3] },
  contentDesktop: {
    width: '100%' as const,
    maxWidth: DESKTOP_MAX_WIDTH,
    alignSelf: 'center' as const,
    paddingTop: theme.spacing[6],
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  columnLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  manage: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[1] },
  manageText: { ...theme.textStyles.bodySmMedium, color: theme.colors.primary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.sm,
  },
  muted: { opacity: 0.75 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    minHeight: 56,
  },
  rowDense: { minHeight: 44 },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  rowHover: { backgroundColor: theme.colors.surfaceSecondary },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  disclosure: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    alignSelf: 'flex-start' as const,
  },
  disclosureText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textSecondary },
  state: { alignItems: 'center' as const, paddingVertical: theme.spacing[10], gap: theme.spacing[3] },
  stateText: { ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' as const },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
  },
  primaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  fxNote: { ...theme.textStyles.caption, color: theme.colors.textSecondary },
  inlineError: { ...theme.textStyles.bodySm, color: theme.colors.danger },
  loadingNote: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
});
