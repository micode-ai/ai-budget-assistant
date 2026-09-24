import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SheetDialog } from '@/components/SheetDialog';
import { ProductDetailSheet, PRODUCT_DETAIL_TITLE_ID } from '@/components/analytics/ProductDetailSheet';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { PriceHistoryProduct } from '@budget/shared-types';

interface ProductDetailModalProps {
  product: PriceHistoryProduct | null;
  isLoading: boolean;
  canEdit: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRename: () => void;
  isRenaming: boolean;
  deletePricePoint: (itemId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Hosts `ProductDetailSheet` for the products-screen search → detail flow
 * (`ProductsSettings.tsx`'s row tap). Same file shape as the two siblings in
 * this directory, `RenameProductModal.tsx`/`MergeProductsModal.tsx` — the
 * chrome (bottom sheet on a phone, centred dialog on desktop web) is
 * `SheetDialog`'s.
 *
 * `PRODUCT_DETAIL_TITLE_ID` already has one consumer, `InflationIndexSection`'s
 * own hand-rolled sheet on the Analytics tab (that one predates `SheetDialog`
 * and is left as-is — refactoring it is out of scope here). Reusing the same
 * id is safe: each mount site's title node only exists in the tree while
 * THAT screen's own product is selected, and reaching both at once would
 * require an explicit tap on two different screens, which normal navigation
 * doesn't allow.
 *
 * `visible` is true from the moment a row is tapped (`isLoading` alone can
 * open it, before `product` resolves) so the sheet slides up immediately with
 * a spinner, rather than waiting on the fetch before the user sees anything
 * happened. `desktopScroll={false}` + an own `ScrollView` + a `maxHeight` sheet
 * box, mirroring `FinancialHealthWidget`'s sheet — a product's price-point
 * table can run long.
 */
export function ProductDetailModal({
  product,
  isLoading,
  canEdit,
  renameValue,
  onRenameValueChange,
  onRename,
  isRenaming,
  deletePricePoint,
  onClose,
}: ProductDetailModalProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SheetDialog
      visible={product !== null || isLoading}
      onClose={onClose}
      titleId={PRODUCT_DETAIL_TITLE_ID}
      scrimColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.sheetBox}
      desktopContentStyle={styles.desktopContent}
      desktopScroll={false}
    >
      {product ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <ProductDetailSheet
            product={product}
            canEdit={canEdit}
            renameValue={renameValue}
            onRenameValueChange={onRenameValueChange}
            onRename={onRename}
            isRenaming={isRenaming}
            deletePricePoint={deletePricePoint}
          />
        </ScrollView>
      ) : (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  sheetBox: { maxHeight: '80%' as const },
  desktopContent: { minHeight: 200 },
  loadingWrap: {
    paddingVertical: theme.spacing[8],
    alignItems: 'center' as const,
  },
});
