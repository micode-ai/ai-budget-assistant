import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { formatCurrency } from '@budget/shared-utils';
import type { SavingsKind, SavingsSummaryResponse } from '@budget/shared-types';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';

interface SavingsDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  kind: SavingsKind | null;
  data: SavingsSummaryResponse | null;
  loading: boolean;
}

/**
 * Stable accessible-name id — only one instance of this sheet is ever
 * mounted at a time, same precedent as `SafeToSpendSheet`'s `TITLE_ID`.
 */
const TITLE_ID = 'savings-detail-sheet-title';

const ICON_BY_KIND: Record<SavingsKind, keyof typeof Ionicons.glyphMap> = {
  // Same icons `ActionResultCard.tsx` already uses for `DiscountTotalResult`/
  // `DepositTotalResult`, so the chat card and this sheet read as one feature.
  discount: 'pricetag-outline',
  deposit: 'wine-outline',
};

/**
 * The drill-down behind the "Discount savings"/"Deposits paid" rows in
 * `QuickInsights.tsx` — total, by-store, and recent-receipts (tap through to
 * `/expense/:id`), backed by `GET /analytics/savings-detail`. Same underlying
 * columns/arithmetic the AI chat's `get_discount_total`/`get_deposit_total`
 * tools already answer from (`docs/contracts/quick-insights-savings-drilldown.md`).
 *
 * The honesty framing below deliberately mirrors `prompt-builder.service.ts`'s
 * own wording for these two tools — never implying a discount is a promise of
 * future deals, never implying a deposit is refundable now.
 */
export function SavingsDetailSheet({ visible, onClose, kind, data, loading }: SavingsDetailSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (!kind) return null;

  const title = kind === 'deposit' ? t('analytics.savingsDetailDepositTitle') : t('analytics.savingsDetailDiscountTitle');
  const note = kind === 'deposit' ? t('analytics.savingsDetailDepositNote') : t('analytics.savingsDetailDiscountNote');
  const icon = ICON_BY_KIND[kind];

  const openReceipt = (expenseId?: string) => {
    if (!expenseId) return;
    onClose();
    router.push(`/expense/${expenseId}` as any);
  };

  const content = (
    <>
      <View style={styles.titleRow}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
        <Text nativeID={TITLE_ID} style={styles.sheetTitle}>{title}</Text>
      </View>

      {loading && (
        <Text style={styles.stateText}>{t('common.loading')}</Text>
      )}

      {!loading && data?.encryptionRestricted && (
        <Text style={styles.stateText}>{t('analytics.savingsDetailEncrypted')}</Text>
      )}

      {!loading && data && !data.encryptionRestricted && data.receiptCount === 0 && (
        <Text style={styles.stateText}>{t('analytics.savingsDetailEmpty')}</Text>
      )}

      {!loading && data && !data.encryptionRestricted && data.receiptCount > 0 && (
        <>
          <View style={styles.totalRow}>
            <Text style={styles.totalValue}>{formatCurrency(data.total, data.baseCurrency)}</Text>
            {/* No i18n key needed — a bare "×N" carries no counted noun, same
                convention `ActionResultCard.tsx`'s deposit/discount cards
                already use for a per-merchant receipt count. */}
            <Text style={styles.totalSub}>×{data.receiptCount}</Text>
          </View>

          {data.byMerchant.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{t('analytics.savingsDetailByStore')}</Text>
              {data.byMerchant.map((m, idx) => (
                <View key={`${m.merchant}-${idx}`} style={styles.row}>
                  <Text style={styles.rowLabel} numberOfLines={1}>{m.merchant}</Text>
                  <Text style={styles.rowValue}>
                    {formatCurrency(m.amount, data.baseCurrency)}
                    {m.receiptCount > 1 ? ` ×${m.receiptCount}` : ''}
                  </Text>
                </View>
              ))}
            </>
          )}

          {data.recent.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{t('analytics.savingsDetailRecent')}</Text>
              {data.recent.map((r, idx) => (
                <TouchableOpacity
                  key={`${r.date}-${idx}`}
                  style={styles.row}
                  disabled={!r.expenseId}
                  onPress={() => openReceipt(r.expenseId)}
                >
                  <View style={styles.recentTextWrap}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{r.merchant || '—'}</Text>
                    <Text style={styles.rowDate}>{r.date}</Text>
                  </View>
                  <Text style={styles.rowValue}>{formatCurrency(r.amount, data.baseCurrency)}</Text>
                  {!!r.expenseId && (
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}

          {data.fxApproximate && (
            <Text style={styles.note}>{t('analytics.savingsDetailApprox')}</Text>
          )}
        </>
      )}

      <Text style={styles.honestyNote}>{note}</Text>

      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>{t('common.done')}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <SheetDialog
      visible={visible}
      onClose={onClose}
      titleId={TITLE_ID}
      padBottom={theme.spacing[8]}
      scrimColor="rgba(0,0,0,0.45)"
      sheetStyle={styles.sheetBox}
      handleStyle={styles.handleBox}
    >
      {content}
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  sheetBox: {
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
  },
  handleBox: {
    width: 40,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    justifyContent: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  sheetTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  stateText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
  totalRow: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  totalValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.success,
    fontWeight: '900' as const,
    fontSize: 28,
  },
  totalSub: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  sectionLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  recentTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  rowDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  rowValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  note: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
    fontStyle: 'italic' as const,
  },
  honestyNote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[4],
  },
  closeButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
    marginTop: theme.spacing[4],
  },
  closeText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
});
