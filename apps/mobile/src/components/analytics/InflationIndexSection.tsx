import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
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
import { InteractiveLineChart } from '@/components/interactive-charts';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
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

export function InflationIndexSection() {
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
  const [isDeletingPoint, setIsDeletingPoint] = useState(false);

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

        {(() => {
          // Render only when there's something to report. `found === null` covers
          // four different states (summary not loaded yet, fetch failed, the
          // alert-write flag is off so totalsByCurrency is permanently {}, or
          // genuinely nothing found) — a discovery feature that hasn't found
          // anything needs no announcement, and a fixed "nothing yet" line would
          // contradict the inline scan-time card in three of those four states.
          const found = pickFoundTotal(priceCheckSummary?.totalsByCurrency ?? {}, user?.currencyCode ?? 'USD');
          if (!found) return null;
          return (
            <Text style={styles.foundTotal}>
              {t('receiptCheck.foundTotal', {
                amount: formatCurrency(found.amount, found.currency as Currency),
              })}
            </Text>
          );
        })()}

        {/* Product list */}
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
      </View>

      {/* Product detail bottom sheet */}
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
              <Text style={styles.sheetTitle}>{selectedProduct.canonicalName}</Text>

              {/* Price history chart */}
              <Text style={styles.sheetSubtitle}>{t('priceHistory.priceHistoryChart')}</Text>
              <InteractiveLineChart
                data={selectedProduct.pricePoints.map((p) => ({
                  label: p.date,
                  value: p.price,
                }))}
                height={180}
                lineColor={theme.colors.primary}
                formatValue={(v) => v.toFixed(2)}
              />

              {/* Price points table */}
              {selectedProduct.pricePoints.map((point) => (
                <View key={point.itemId} style={styles.priceRow}>
                  <View style={styles.priceRowLeft}>
                    <Text style={styles.priceRowDate}>{point.date}</Text>
                    <Text style={styles.priceRowMerchant} numberOfLines={1}>{point.merchant}</Text>
                  </View>
                  <Text style={styles.priceRowValue}>
                    {point.price.toFixed(2)} {selectedProduct.currency}
                  </Text>
                  {canEdit && (
                    <TouchableOpacity
                      style={styles.priceRowDelete}
                      disabled={isDeletingPoint}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        Alert.alert(
                          t('priceHistory.removePrice'),
                          t('priceHistory.removePriceConfirm', {
                            date: point.date,
                            price: `${point.price.toFixed(2)} ${selectedProduct.currency}`,
                          }),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('priceHistory.removePrice'),
                              style: 'destructive',
                              onPress: async () => {
                                setIsDeletingPoint(true);
                                try {
                                  await deletePricePoint(point.itemId);
                                } catch {
                                  // warn'd in store
                                } finally {
                                  setIsDeletingPoint(false);
                                }
                              },
                            },
                          ],
                        );
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={isDeletingPoint ? theme.colors.textTertiary : theme.colors.danger}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* Store comparison — sorted cheapest-first */}
              <Text style={styles.sheetSubtitle}>{t('priceHistory.storeComparison')}</Text>
              {[...selectedProduct.stores]
                .sort((a, b) => a.latestPrice - b.latestPrice)
                .map((store, i) => (
                  <View key={store.merchantName} style={styles.storeRow}>
                    <View style={styles.storeLeft}>
                      {i === 0 && (
                        <View style={styles.cheapestBadge}>
                          <Text style={styles.cheapestText}>
                            {t('priceHistory.cheapestStore')}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.storeName} numberOfLines={1}>
                        {store.merchantName}
                      </Text>
                    </View>
                    <Text style={styles.storePrice}>
                      {store.latestPrice.toFixed(2)} {selectedProduct.currency}
                    </Text>
                  </View>
                ))}

              {/* Rename — editors/owners only */}
              {canEdit && (
                <>
                  <Text style={styles.sheetSubtitle}>{t('priceHistory.renameProduct')}</Text>
                  <TextInput
                    style={styles.renameInput}
                    value={renameValue}
                    onChangeText={setRenameValue}
                    placeholder={selectedProduct.canonicalName}
                    placeholderTextColor={theme.colors.textTertiary}
                  />
                  <TouchableOpacity
                    style={[styles.ctaButton, isRenaming && styles.ctaButtonDisabled]}
                    onPress={handleRename}
                    disabled={isRenaming}
                  >
                    <Text style={styles.ctaText}>{t('priceHistory.renameProduct')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing[2],
  },
  priceRowLeft: {
    flex: 1,
  },
  priceRowDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  priceRowMerchant: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  priceRowValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  priceRowDelete: {
    padding: theme.spacing[1],
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
  sheetTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  sheetSubtitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  storeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  storeLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  cheapestBadge: {
    backgroundColor: theme.colors.successLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    marginRight: theme.spacing[2],
    flexShrink: 0,
  },
  cheapestText: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
  },
  storeName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  storePrice: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
});
