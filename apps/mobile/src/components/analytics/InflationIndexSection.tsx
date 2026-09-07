import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles, useTheme, type Theme } from '@/theme';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAlertStore } from '@/stores/alertStore';
import { useAuthStore } from '@/stores/authStore';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { ProductDetailSheet, PRODUCT_DETAIL_TITLE_ID } from './ProductDetailSheet';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency, PriceHistoryProduct } from '@budget/shared-types';

/**
 * Picks ONE currency to show for the "found" total — the user's own display
 * currency if the price check found anything in it, otherwise the largest
 * single total. Never sums or converts across currencies: this feature
 * forbids FX everywhere, so a blended figure would be fabricated.
 */
export function pickFoundTotal(
  totalsByCurrency: Record<string, number>,
  baseCurrency: string,
): { amount: number; currency: string } | null {
  const entries = Object.entries(totalsByCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  const own = entries.find(([c]) => c === baseCurrency);
  const [currency, amount] = own ?? entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { amount, currency };
}

type Period = '3m' | '6m' | '12m' | 'all';

const PERIOD_KEYS: Record<Period, string> = {
  '3m': 'priceHistory.period3m',
  '6m': 'priceHistory.period6m',
  '12m': 'priceHistory.period12m',
  'all': 'priceHistory.periodAll',
};

const PERIODS: Period[] = ['3m', '6m', '12m', 'all'];

export interface InflationIndexSectionProps {
  /**
   * True only when hosted by `AnalyticsDesktop` (ABA-501 Task 5). Reflows the
   * card's headline / product-list / links-rail from one vertical stack into
   * three columns (design's "Personal Inflation Index — reflowed, not
   * rebuilt") and hosts the product-detail view as a centred dialog instead
   * of a bottom sheet (design's Universal dialogs rule — "a sheet is a phone
   * idiom"). Defaults to `false`, the original stacked layout + bottom
   * sheet, so `AnalyticsMobile.tsx`'s own `<InflationIndexSection />` call
   * site — and every other consumer that doesn't pass this — renders
   * byte-for-byte as before.
   */
  desktop?: boolean;
}

export function InflationIndexSection({ desktop = false }: InflationIndexSectionProps = {}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { history, isLoading, hasAttemptedLoad, selectedPeriod, loadPriceHistory, upsertAlias, deletePricePoint } =
    usePriceHistoryStore();
  const canEdit = useAccountStore((s) => s.canEdit());
  const priceCheckSummary = useAlertStore((s) => s.priceCheckSummary);
  const user = useAuthStore((s) => s.user);

  const [showAll, setShowAll] = useState(false);
  const [selectedRawName, setSelectedRawName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Derive selectedProduct live from history so the table refreshes after deletion
  const selectedProduct = selectedRawName
    ? (history?.products.find((p) => p.rawName === selectedRawName) ?? null)
    : null;

  const handlePeriodChange = useCallback(
    (p: Period) => {
      if (p !== selectedPeriod) loadPriceHistory(p);
    },
    [selectedPeriod, loadPriceHistory],
  );

  const openProduct = useCallback((product: PriceHistoryProduct) => {
    setSelectedRawName(product.rawName);
    setRenameValue(product.canonicalName);
  }, []);

  const closeSheet = useCallback(() => {
    setSelectedRawName(null);
  }, []);

  const handleRename = useCallback(async () => {
    if (!selectedProduct || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      await upsertAlias(selectedProduct.rawName, renameValue.trim());
      setSelectedRawName(null);
    } catch {
      // warn already logged in store
    } finally {
      setIsRenaming(false);
    }
  }, [selectedProduct, renameValue, upsertAlias]);

  // Don't render until first load attempt (avoids flash before useEffect fires)
  if (!hasAttemptedLoad && !isLoading) return null;

  const products = history?.products ?? [];
  const displayProducts = showAll ? products : products.slice(0, 3);
  const remaining = products.length - 3;

  // Empty state: never scanned any receipts (history === null means no data at all)
  if (!isLoading && history === null) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('priceHistory.title')}</Text>
        <View style={styles.card}>
          <Text style={styles.emptyText}>{t('priceHistory.notEnoughData')}</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/expense/receipt')}
          >
            <Text style={styles.ctaText}>{t('priceHistory.scanReceiptCta')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render only when there's something to report. `found === null` covers four
  // different states (summary not loaded yet, fetch failed, the alert-write
  // flag is off so totalsByCurrency is permanently {}, or genuinely nothing
  // found) — a discovery feature that hasn't found anything needs no
  // announcement, and a fixed "nothing yet" line would contradict the inline
  // scan-time card in three of those four states.
  const found = pickFoundTotal(priceCheckSummary?.totalsByCurrency ?? {}, user?.currencyCode ?? 'USD');
  const foundTotalNode = found ? (
    <Text style={styles.foundTotal}>
      {t('receiptCheck.foundTotal', {
        amount: formatCurrency(found.amount, found.currency as Currency),
      })}
    </Text>
  ) : null;

  // Same headline (%), same found-total line, same product list (top 3 +
  // "show more"), same three links — grouped here so the card body can
  // render them either stacked (mobile, unchanged) or as three columns
  // (desktop, design's "Personal Inflation Index — reflowed, not rebuilt").
  // Grouping alone changes nothing about what each block renders.
  const headlineBlock = (
    <>
      {/* Period-specific empty state: has data but not enough for this period */}
      {!isLoading && history !== null && history.productCount === 0 && (
        <Text style={styles.emptyText}>{t('priceHistory.noDataForPeriod')}</Text>
      )}

      {/* Inflation headline */}
      {history && history.inflationIndex !== null && (
        <>
          <Text
            style={[
              styles.headline,
              {
                color:
                  history.inflationIndex > 0
                    ? theme.colors.danger
                    : theme.colors.success,
              },
            ]}
          >
            {history.inflationIndex > 0 ? '+' : ''}
            {history.inflationIndex.toFixed(1)}%
          </Text>
          <Text style={styles.subline}>
            {t('priceHistory.trackedProducts', {
              count: history.productCount,
              period: t(PERIOD_KEYS[history.period] as any),
            })}
          </Text>
        </>
      )}

      {foundTotalNode}
    </>
  );

  const productListBlock = (
    <>
      {displayProducts.map((product) => (
        <TouchableOpacity
          key={product.canonicalName}
          style={styles.productRow}
          onPress={() => openProduct(product)}
        >
          <Text style={styles.productName} numberOfLines={1}>
            {product.canonicalName}
          </Text>
          <View style={styles.productRight}>
            <Text
              style={[
                styles.productPct,
                {
                  color:
                    product.priceChangePct > 0
                      ? theme.colors.danger
                      : theme.colors.success,
                },
              ]}
            >
              {product.priceChangePct > 0 ? '+' : ''}
              {product.priceChangePct.toFixed(1)}%
            </Text>
            <Text style={styles.productPrice}>
              {product.currentAvgPrice.toFixed(2)} {product.currency}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {!showAll && remaining > 0 && (
        <TouchableOpacity onPress={() => setShowAll(true)} style={styles.showMore}>
          <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.showMoreText}>{t('priceHistory.showMore', { count: remaining })}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const linksBlock = (
    <>
      <TouchableOpacity
        style={styles.manageLink}
        onPress={() => router.push('/settings/products' as any)}
      >
        <Text style={styles.manageLinkText}>{t('priceHistory.manageProducts')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.manageLink}
        onPress={() => router.push('/shopping-list' as any)}
      >
        <Text style={styles.manageLinkText}>{t('shoppingList.planAShop')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.communityBanner}
        onPress={() => router.push('/price-history/community' as any)}
      >
        <View style={styles.communityBannerIcon}>
          <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.communityBannerText}>
          <Text style={styles.communityBannerTitle}>{t('communityPrices.entryTitle')}</Text>
          <Text style={styles.communityBannerSubtitle}>
            {t('communityPrices.entrySubtitle')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.section}>
      {/* Header + period chips */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>{t('priceHistory.title')}</Text>
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, selectedPeriod === p && styles.periodChipActive]}
              onPress={() => handlePeriodChange(p)}
            >
              <Text
                style={[
                  styles.periodChipText,
                  selectedPeriod === p && styles.periodChipTextActive,
                ]}
              >
                {t(PERIOD_KEYS[p] as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {desktop ? (
          <View style={styles.columnsRow}>
            <View style={styles.headlineColumn}>{headlineBlock}</View>
            <View style={styles.listColumn}>{productListBlock}</View>
            <View style={styles.linksColumn}>{linksBlock}</View>
          </View>
        ) : (
          <>
            {headlineBlock}
            {productListBlock}
            {linksBlock}
          </>
        )}
      </View>

      {/* Product detail — a bottom sheet on mobile/narrow-web (unchanged),
          a centred dialog on desktop (design's Universal dialogs rule). Both
          host the exact same `ProductDetailSheet` content; only the chrome
          around it differs. */}
      {desktop ? (
        selectedProduct && (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={closeSheet}
            aria-labelledby={PRODUCT_DETAIL_TITLE_ID}
          >
            {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
                `ExpenseDialog.tsx`'s file-level comment for why it must carry
                no tabindex at all (a `Pressable` scrim would steal the focus
                trap's initial focus). */}
            <div
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeSheet();
              }}
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.overlay,
                padding: 24,
              }}
            >
              <View style={styles.dialogPanel}>
                <View style={styles.dialogHeader}>
                  <Pressable
                    onPress={closeSheet}
                    accessibilityRole="button"
                    accessibilityLabel={t('expensesDesktop.dialogClose')}
                    style={styles.dialogCloseButton}
                  >
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
                <ScrollView style={styles.dialogBody} contentContainerStyle={styles.dialogBodyContent}>
                  <ProductDetailSheet
                    product={selectedProduct}
                    canEdit={canEdit}
                    renameValue={renameValue}
                    onRenameValueChange={setRenameValue}
                    onRename={handleRename}
                    isRenaming={isRenaming}
                    deletePricePoint={deletePricePoint}
                  />
                </ScrollView>
              </View>
            </div>
          </Modal>
        )
      ) : (
        <Modal
          visible={selectedProduct !== null}
          transparent
          animationType="slide"
          onRequestClose={closeSheet}
        >
          <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeSheet} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            {selectedProduct && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.sheetHandle} />
                <ProductDetailSheet
                  product={selectedProduct}
                  canEdit={canEdit}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onRename={handleRename}
                  isRenaming={isRenaming}
                  deletePricePoint={deletePricePoint}
                />
              </ScrollView>
            )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  periodRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[1],
  },
  periodChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  periodChipActive: {
    backgroundColor: theme.colors.primary,
  },
  periodChipText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  periodChipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  // Desktop-only reflow (ABA-501 Task 5): headline block / product list /
  // links rail side by side instead of stacked. Percentage `flexBasis` +
  // `flexShrink: 1` mirrors `AnalyticsDesktop`'s own `BreakdownGrid` —
  // React Native's `View` defaults `flexShrink` to 0 (unlike the web
  // default of 1), so without it these tracks would overflow the card
  // instead of yielding the gap's width back.
  columnsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  headlineColumn: {
    flexBasis: '24%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  listColumn: {
    flexBasis: '44%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingLeft: theme.spacing[4],
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.divider,
  },
  linksColumn: {
    flexBasis: '28%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingLeft: theme.spacing[4],
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.divider,
  },
  headline: {
    ...theme.textStyles.h1,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[1],
  },
  subline: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  foundTotal: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  productRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  productName: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  productRight: {
    alignItems: 'flex-end' as const,
  },
  productPct: {
    ...theme.textStyles.bodyMedium,
  },
  productPrice: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  showMore: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingTop: theme.spacing[3],
    gap: theme.spacing[1],
  },
  showMoreText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  manageLink: {
    marginTop: theme.spacing[4],
    alignItems: 'center' as const,
  },
  manageLinkText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  communityBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing[3],
  },
  communityBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexShrink: 0,
  },
  communityBannerText: {
    flex: 1,
  },
  communityBannerTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  communityBannerSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  ctaButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    ...theme.textStyles.bodyMedium,
    color: '#fff',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[4],
    maxHeight: '80%' as any,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.divider,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  // Desktop-only centred dialog chrome (ABA-501 Task 5), mirroring
  // `ExpenseDialog.tsx`'s panel/header shapes. No separate title element —
  // `ProductDetailSheet`'s own heading (`sheetTitle`, styled `h3`, marked
  // with `PRODUCT_DETAIL_TITLE_ID`) already serves as the dialog's
  // accessible name via `aria-labelledby`, so a second title in this header
  // would only duplicate it.
  dialogPanel: {
    width: '90%' as const,
    maxWidth: 640,
    maxHeight: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  dialogHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  dialogCloseButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  dialogBody: {
    flexShrink: 1,
  },
  dialogBodyContent: {
    padding: theme.spacing[4],
  },
});
