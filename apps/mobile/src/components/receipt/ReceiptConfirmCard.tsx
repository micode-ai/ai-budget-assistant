import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, type ReceiptCategorySplit } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { MerchantInput } from '@/components/MerchantInput';
import PriceFindingsCard from '@/components/receipt/PriceFindingsCard';
import CategorySplitChips from '@/components/receipt/CategorySplitChips';
import type { ScannedReceipt } from '@/features/receipt/useReceiptScanner';

interface Props {
  scannedReceipt: ScannedReceipt | null;
  imageUri: string | null;
  isPdf: boolean;
  merchant: string;
  onMerchantChange: (text: string) => void;
  currentSplits: ReceiptCategorySplit[];
  splitDropped: boolean;
  /** `sheetItems.length` from `useReceiptCategorySplit` — whether there are any
   * receipt lines to assign at all (see `CategorySplitChips`'s `hasItems`). */
  sheetItemsLength: number;
  onOpenSplitSheet: () => void;
  saveImage: boolean;
  onToggleSaveImage: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}

/**
 * The post-scan confirm card of `app/expense/receipt.tsx` (ABA-448) — the
 * receipt preview, editable amount/discount/deposit/description/merchant/
 * category/date fields, the category-split chips, up to 5 line items, the
 * confidence indicator, the price-check findings, and the save-image/edit/
 * confirm/retry actions. Purely presentational; every field it shows and
 * every action it fires is owned by the screen (via
 * `useReceiptCategorySplit`/`useReceiptSave`).
 */
export default function ReceiptConfirmCard({
  scannedReceipt,
  imageUri,
  isPdf,
  merchant,
  onMerchantChange,
  currentSplits,
  splitDropped,
  sheetItemsLength,
  onOpenSplitSheet,
  saveImage,
  onToggleSaveImage,
  onEdit,
  onConfirm,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.confirmContainer}>
      <Text style={styles.confirmTitle}>{t('receipt.scannedTitle')}</Text>

      {!isPdf && imageUri && (
        <Image source={{ uri: imageUri }} style={styles.receiptImage} />
      )}

      <View style={styles.expenseCard}>
        <View style={styles.expenseRow}>
          <Text style={styles.expenseLabel}>{t('receipt.totalAmount')}</Text>
          <Text style={styles.expenseAmount}>
            {formatCurrency(
              scannedReceipt?.amount || 0,
              (scannedReceipt?.currencyCode || 'USD') as Currency
            )}
          </Text>
        </View>

        {scannedReceipt?.discountAmount != null && scannedReceipt.discountAmount > 0 && (
          <View style={styles.expenseRow}>
            <Text style={styles.expenseLabel}>{t('receipt.discount')}</Text>
            <Text style={[styles.expenseValue, { color: theme.colors.success }]}>
              -{formatCurrency(
                scannedReceipt.discountAmount,
                (scannedReceipt?.currencyCode || 'USD') as Currency
              )}
            </Text>
          </View>
        )}

        {scannedReceipt?.depositAmount != null && scannedReceipt.depositAmount > 0 && (
          <View style={styles.expenseRow}>
            <Text style={styles.expenseLabel}>{t('receipt.deposit')}</Text>
            <Text style={styles.expenseValue}>
              {formatCurrency(
                scannedReceipt.depositAmount,
                (scannedReceipt?.currencyCode || 'USD') as Currency
              )}
            </Text>
          </View>
        )}

        <View style={styles.expenseRow}>
          <Text style={styles.expenseLabel}>{t('receipt.description')}</Text>
          <Text style={styles.expenseValue}>{scannedReceipt?.description}</Text>
        </View>

        <View style={styles.merchantField}>
          <MerchantInput value={merchant} onChangeText={onMerchantChange} />
        </View>

        <View style={styles.expenseRow}>
          <Text style={styles.expenseLabel}>{t('receipt.category')}</Text>
          <Text style={styles.expenseValue}>
            {scannedReceipt?.categorySuggestion || t('common.uncategorized')}
          </Text>
        </View>

        {scannedReceipt?.date && (
          <View style={styles.expenseRow}>
            <Text style={styles.expenseLabel}>{t('receipt.date')}</Text>
            <Text style={styles.expenseValue}>
              {new Date(scannedReceipt.date + 'T12:00:00').toLocaleDateString(getIntlLocale())}
            </Text>
          </View>
        )}

        <CategorySplitChips
          splits={currentSplits}
          currencyCode={scannedReceipt?.currencyCode || 'USD'}
          hasItems={sheetItemsLength > 0}
          onPress={onOpenSplitSheet}
        />

        {splitDropped && currentSplits.length === 0 && (
          <Text style={styles.splitDroppedNote}>{t('receiptCategorySplit.dropped')}</Text>
        )}

        {/* The lines carry their categories, but the amounts did not add
            up to a split the server would publish. Saying so beats an
            empty block, and the editor below can still produce one. */}
        {!splitDropped && currentSplits.length === 0 && sheetItemsLength > 1 && (
          <Text style={styles.splitDroppedNote}>{t('receiptCategorySplit.notSplit')}</Text>
        )}

        {scannedReceipt?.receiptItems && scannedReceipt.receiptItems.length > 0 && (
          <View style={styles.itemsSection}>
            <Text style={styles.itemsTitle}>{t('receipt.items', { count: scannedReceipt.receiptItems.length })}</Text>
            {scannedReceipt.receiptItems.slice(0, 5).map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Text style={styles.itemDescription} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={styles.itemPrice}>
                  {formatCurrency(
                    item.totalPrice,
                    (scannedReceipt?.currencyCode || 'USD') as Currency
                  )}
                </Text>
              </View>
            ))}
            {scannedReceipt.receiptItems.length > 5 && (
              <Text style={styles.moreItems}>
                {t('receipt.moreItems', { count: scannedReceipt.receiptItems.length - 5 })}
              </Text>
            )}
          </View>
        )}

        <View style={styles.confidenceRow}>
          <Ionicons
            name={
              scannedReceipt && scannedReceipt.confidence > 0.8
                ? 'checkmark-circle'
                : 'alert-circle'
            }
            size={16}
            color={
              scannedReceipt && scannedReceipt.confidence > 0.8 ? theme.colors.primary : theme.colors.warning
            }
          />
          <Text style={styles.confidenceText}>
            {scannedReceipt && scannedReceipt.confidence > 0.8 ? t('receipt.highConfidence') : t('receipt.mediumConfidence')}
          </Text>
        </View>
      </View>

      <PriceFindingsCard findings={scannedReceipt?.priceFindings ?? []} />

      {!isPdf && (
        <TouchableOpacity
          style={styles.saveImageCheckbox}
          onPress={onToggleSaveImage}
          activeOpacity={0.7}
        >
          <Ionicons
            name={saveImage ? 'checkbox' : 'square-outline'}
            size={24}
            color={saveImage ? theme.colors.primary : theme.colors.textTertiary}
          />
          <Text style={styles.saveImageText}>{t('receipt.saveImage')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.confirmActions}>
        <TouchableOpacity style={styles.editButton} onPress={onEdit}>
          <Ionicons name="pencil" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <Ionicons name="checkmark" size={24} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />
        <Text style={styles.retryButtonText}>{t('receipt.scanAgain')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  confirmContainer: {
    width: '100%' as const,
    alignItems: 'center' as const,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  receiptImage: {
    width: 120,
    height: 160,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  expenseCard: {
    width: '100%' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[6],
  },
  expenseRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  expenseLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
  expenseValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    maxWidth: '60%' as const,
    textAlign: 'right' as const,
  },
  itemsSection: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  itemRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
  },
  itemDescription: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[3],
  },
  itemPrice: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  moreItems: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center' as const,
  },
  splitDroppedNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    fontStyle: 'italic' as const,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
    textAlign: 'center' as const,
  },
  confidenceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingTop: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  confidenceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  saveImageCheckbox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2.5],
    marginBottom: theme.spacing[5],
    paddingHorizontal: theme.spacing[2],
  },
  saveImageText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  confirmActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
    width: '100%' as const,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  editButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  confirmButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  retryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  retryButtonText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  merchantField: {
    marginTop: theme.spacing[2],
  },
});
