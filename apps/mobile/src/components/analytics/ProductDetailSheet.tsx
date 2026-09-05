import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useStyles, useTheme, type Theme } from '@/theme';
import { InteractiveLineChart } from '@/components/interactive-charts';
import type { PriceHistoryProduct } from '@budget/shared-types';

/**
 * Stable accessible-name id for the product title. Referenced by the desktop
 * dialog chrome's `aria-labelledby` in `InflationIndexSection.tsx`, mirroring
 * `ExpenseDialog.tsx`'s own `TITLE_ID` convention — a fixed id is safe for
 * the same reason given there: `InflationIndexSection` only ever has one
 * product selected at a time, so only one instance of this component is ever
 * mounted at once.
 */
export const PRODUCT_DETAIL_TITLE_ID = 'inflation-product-detail-title';

export interface ProductDetailSheetProps {
  product: PriceHistoryProduct;
  /** Viewer role can read but not rename or delete a price point. */
  canEdit: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  /** `InflationIndexSection`'s own `handleRename` — fire-and-forget from
   *  here exactly as it was before the extraction; the caller flips
   *  `isRenaming` and closes the sheet/dialog on success. */
  onRename: () => void;
  isRenaming: boolean;
  /** `usePriceHistoryStore().deletePricePoint`, passed down rather than
   *  subscribed to here — keeps this component presentational, the same
   *  "every number arrives already computed" convention `BreakdownCard`
   *  documents for the desktop breakdown grid. */
  deletePricePoint: (itemId: string) => Promise<void>;
}

/**
 * The per-product detail view — price-history chart, the raw price-point
 * table (with delete), the cheapest-first store comparison, and the rename
 * field. Extracted verbatim out of `InflationIndexSection.tsx`'s inline
 * bottom-sheet `Modal` (ABA-501 Task 5, design's "Personal Inflation Index —
 * reflowed, not rebuilt") so it can be hosted by TWO different chromes:
 * `InflationIndexSection` itself still wraps this in the exact same
 * bottom-sheet `Modal` for mobile/narrow-web (byte-for-byte unchanged), and
 * wraps it in a centred dialog `Modal` instead when rendering inside
 * `AnalyticsDesktop` (design's Universal dialogs rule — "a sheet is a phone
 * idiom"). This component owns none of that chrome — no `Modal`, no
 * backdrop, no bottom-sheet handle, no dialog panel/header — only the
 * content that goes inside it. Same split as `ExpenseDetailsCard`/
 * `ExpenseDialog`: a dialog HOSTS this, it never reimplements it.
 *
 * One piece of state moved down with the content rather than staying in the
 * parent: `isDeletingPoint` (the in-flight state of the delete confirm) was
 * only ever read/written inside this exact block, so it is now local here.
 * `renameValue`/`isRenaming` stay in the parent because opening a NEW
 * product seeds `renameValue` from outside this component's lifetime, and a
 * successful rename must close the sheet/dialog, which only the parent can
 * do (it owns `selectedRawName`).
 *
 * Delete confirmation uses `showAlert`, not `Alert.alert` — the original
 * inline code used `Alert.alert`, which react-native-web stubs to a no-op
 * (see the design language doc's "Universal — dialogs" section). Since this
 * content is now also reachable from the desktop dialog on web, that call
 * would have silently done nothing there. `showAlert` behaves identically to
 * `Alert.alert` on native, so nothing about the native/mobile rendering
 * changes — this only makes the web path (new and pre-existing narrow-web)
 * actually work.
 */
export function ProductDetailSheet({
  product,
  canEdit,
  renameValue,
  onRenameValueChange,
  onRename,
  isRenaming,
  deletePricePoint,
}: ProductDetailSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [isDeletingPoint, setIsDeletingPoint] = useState(false);

  const confirmDeletePricePoint = (point: PriceHistoryProduct['pricePoints'][number]) => {
    showAlert(
      t('priceHistory.removePrice'),
      t('priceHistory.removePriceConfirm', {
        date: point.date,
        price: `${point.price.toFixed(2)} ${product.currency}`,
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
  };

  return (
    <>
      <Text nativeID={PRODUCT_DETAIL_TITLE_ID} style={styles.sheetTitle}>
        {product.canonicalName}
      </Text>

      {/* Price history chart */}
      <Text style={styles.sheetSubtitle}>{t('priceHistory.priceHistoryChart')}</Text>
      <InteractiveLineChart
        data={product.pricePoints.map((p) => ({
          label: p.date,
          value: p.price,
        }))}
        height={180}
        lineColor={theme.colors.primary}
        formatValue={(v) => v.toFixed(2)}
      />

      {/* Price points table */}
      {product.pricePoints.map((point) => (
        <View key={point.itemId} style={styles.priceRow}>
          <View style={styles.priceRowLeft}>
            <Text style={styles.priceRowDate}>{point.date}</Text>
            <Text style={styles.priceRowMerchant} numberOfLines={1}>{point.merchant}</Text>
          </View>
          <Text style={styles.priceRowValue}>
            {point.price.toFixed(2)} {product.currency}
          </Text>
          {canEdit && (
            <TouchableOpacity
              style={styles.priceRowDelete}
              disabled={isDeletingPoint}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => confirmDeletePricePoint(point)}
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
      {[...product.stores]
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
              {store.latestPrice.toFixed(2)} {product.currency}
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
            onChangeText={onRenameValueChange}
            placeholder={product.canonicalName}
            placeholderTextColor={theme.colors.textTertiary}
          />
          <TouchableOpacity
            style={[styles.ctaButton, isRenaming && styles.ctaButtonDisabled]}
            onPress={onRename}
            disabled={isRenaming}
          >
            <Text style={styles.ctaText}>{t('priceHistory.renameProduct')}</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
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
});
