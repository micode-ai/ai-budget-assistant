import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { uriToBase64 } from '@/utils/fileBase64';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { scanEncodedParts } from '@/features/receipt/receiptParts';
import type { IndexedReceiptPart } from '@/features/receipt/receiptPartsView';
import { compressAndEncodeImage } from '@/features/receipt/receiptImage';
import { materializeReceipt, releaseReceipt } from '@/features/receipt/receiptImageCache';
import { ReceiptImageViewer } from '@/components/receipt/ReceiptImageViewer';
import { useExpenseStore } from '@/stores/expenseStore';
import { api } from '@/services/api';
import { applyCarriedAttribution, resolveLineIdBySortOrder } from '@/features/children/useChildAttribution';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ReceiptSectionProps {
  expenseId: string;
  canEdit?: boolean;
  /** Notifies the parent whether a receipt is attached, so the receipt-items
   * section can render for non-OCR expenses too. */
  onReceiptLoaded?: (hasReceipt: boolean) => void;
}

export function ReceiptSection({
  expenseId,
  canEdit = false,
  onReceiptLoaded,
}: ReceiptSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { loadReceiptImage, loadReceiptParts, saveReceiptImage, deleteReceiptImage, loadExpenseItems, addExpenseItem, deleteExpenseItem } =
    useExpenseStore();

  // The receipt lives on disk, not in state. Holding the base64 here kept a
  // multi-megabyte string alive for as long as the screen did, and rendering it
  // as a `data:` URL forced <Image> to decode the full-resolution bitmap even
  // for the 200pt thumbnail. A file URI lets Fresco sample it down to the size
  // actually on screen.
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMimeType, setReceiptMimeType] = useState<string>('image/jpeg');
  // Kept ONLY in a ref (not state) so a multi-MB base64 blob never triggers a
  // re-render — it is read once per "Extract items" tap. Same lifecycle as the
  // materialized file URI below.
  const receiptBase64Ref = useRef<string | null>(null);
  // Parts 2..N of a long receipt: file URIs for display, base64 only in a ref
  // (read once per "Extract items" tap, like part 1).
  const [extraUris, setExtraUris] = useState<string[]>([]);
  const extraUrisRef = useRef<string[]>([]);
  const extraBase64Ref = useRef<string[]>([]);
  const [partsLoadFailed, setPartsLoadFailed] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const receiptUriRef = useRef<string | null>(null);

  const isPdf = receiptMimeType === 'application/pdf';

  const showReceipt = useCallback(
    async (base64: string | null, mimeType: string) => {
      const previous = receiptUriRef.current;
      const next = base64 ? (await materializeReceipt(expenseId, base64, mimeType)).uri : null;
      receiptUriRef.current = next;
      receiptBase64Ref.current = base64;
      setReceiptMimeType(mimeType);
      setReceiptUri(next);
      onReceiptLoaded?.(!!base64);
      if (previous && previous !== next) void releaseReceipt(previous);
    },
    [expenseId, onReceiptLoaded],
  );

  const showExtraParts = useCallback(
    async (parts: IndexedReceiptPart[]) => {
      const previous = extraUrisRef.current;
      const next = await Promise.all(
        parts.map(async (p) => (await materializeReceipt(`${expenseId}-p${p.index}`, p.imageBase64, p.mimeType)).uri),
      );
      extraUrisRef.current = next;
      extraBase64Ref.current = parts.map((p) => p.imageBase64);
      setExtraUris(next);
      for (const uri of previous) if (!next.includes(uri)) void releaseReceipt(uri);
    },
    [expenseId],
  );

  const handleLoadReceiptImage = useCallback(async (isCancelled: () => boolean = () => false) => {
    setImageLoading(true);
    try {
      const result = await loadReceiptImage(expenseId);
      if (isCancelled()) return;
      await showReceipt(result?.base64 ?? null, result?.mimeType ?? 'image/jpeg');
      if (result && result.mimeType !== 'application/pdf') {
        try {
          const extra = await loadReceiptParts(expenseId);
          if (isCancelled()) return;
          await showExtraParts(extra);
          setPartsLoadFailed(false);
        } catch (e) {
          // A failed read is not "no parts": Extract items must not run on part 1 alone.
          if (isCancelled()) return;
          console.warn('[ReceiptSection] Failed to load receipt parts:', e);
          await showExtraParts([]);
          setPartsLoadFailed(true);
        }
      } else {
        await showExtraParts([]);
        setPartsLoadFailed(false);
      }
    } catch (e) {
      console.warn('[ReceiptSection] Failed to load receipt image:', e);
      await showReceipt(null, 'image/jpeg');
    } finally {
      setImageLoading(false);
    }
  }, [expenseId, loadReceiptImage, loadReceiptParts, showReceipt, showExtraParts]);

  useEffect(() => {
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      void handleLoadReceiptImage(() => cancelled);
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [expenseId, handleLoadReceiptImage]);

  // Drop the cached copy when the screen is gone for good, so viewing many
  // receipts does not leave one file per expense behind in the cache dir.
  useEffect(
    () => () => {
      void releaseReceipt(receiptUriRef.current);
      for (const uri of extraUrisRef.current) void releaseReceipt(uri);
    },
    [],
  );

  const handleShareImage = async () => {
    if (!receiptUri) return;
    await Sharing.shareAsync(receiptUri, { mimeType: receiptMimeType });
  };

  const handleSaveImage = async () => {
    if (!receiptUri) return;
    if (isPdf) return handleShareImage();
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('common.error'), t('expenseDetail.galleryPermissionDenied'));
      return;
    }
    await MediaLibrary.saveToLibraryAsync(receiptUri);
    showAlert('', t('expenseDetail.imageSaved'));
  };

  const attachImage = async (uri: string, sourceWidth?: number) => {
    const base64 = await compressAndEncodeImage(uri, sourceWidth);
    await saveReceiptImage(expenseId, base64, 'image/jpeg');
    await showReceipt(base64, 'image/jpeg');
    await showExtraParts([]);
    setPartsLoadFailed(false);
  };

  const handleAttachFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('common.error'), t('expenseDetail.cameraPermissionDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    await attachImage(result.assets[0].uri, result.assets[0].width);
  };

  const handleAttachFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    await attachImage(result.assets[0].uri, result.assets[0].width);
  };

  const handleAttachAsPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const base64 = await uriToBase64(result.assets[0].uri);
    await saveReceiptImage(expenseId, base64, 'application/pdf');
    await showReceipt(base64, 'application/pdf');
    await showExtraParts([]);
    setPartsLoadFailed(false);
  };

  // Re-run OCR over the attached receipt and apply its line items to this
  // expense — the "regenerate" flow: the expense was logged first (manually or
  // captured by a push/import) and the receipt came later.
  const handleExtractItems = async () => {
    const base64 = receiptBase64Ref.current;
    if (!base64 || extracting) return;
    if (partsLoadFailed) {
      showAlert(t('common.error'), t('expenseDetail.receiptPartsLoadFailed'));
      return;
    }
    setExtracting(true);
    try {
      // A long receipt re-reads ALL its parts in one call (billed per part).
      const receipt =
        extraBase64Ref.current.length > 0 && !isPdf
          ? await scanEncodedParts([base64, ...extraBase64Ref.current], undefined, {
              scanReceipt: (b64, prompt) => api.scanReceipt(b64, prompt),
              scanReceiptParts: (parts, prompt) => api.scanReceiptParts(parts, prompt),
            })
          : await api.scanReceipt(base64, undefined, isPdf ? 'application/pdf' : undefined);
      const scannedItems = receipt?.receiptItems ?? [];
      if (scannedItems.length === 0) {
        showAlert('', t('expenseDetail.extractItemsNoItems'));
        return;
      }

      const existing = await loadExpenseItems(expenseId);
      const apply = async () => {
        // Replace, never append: re-running the OCR twice would duplicate lines.
        for (const item of existing) deleteExpenseItem(expenseId, item.id);
        scannedItems.forEach((it, index) => {
          const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
          addExpenseItem(expenseId, {
            description: it.description,
            quantity: qty,
            unitPrice: it.unitPrice ?? Math.round((it.totalPrice / qty) * 100) / 100,
            totalPrice: it.totalPrice,
            sortOrder: index,
          });
        });
        const done = t('expenseDetail.extractItemsDone', { count: scannedItems.length });
        if (!existing.some((i) => !i.isDeleted && i.childId)) {
          showAlert('', done);
          return;
        }
        // Child costs: a line's child follows it onto the regenerated line with
        // the same normalized product name; the user is told how many could not.
        setExtracting(true);
        try {
          const { lost } = await applyCarriedAttribution({
            expenseId,
            oldItems: existing,
            scanned: scannedItems.map((it) => ({ description: it.description, canonicalName: it.canonicalName })),
            resolveItemId: (index) => resolveLineIdBySortOrder(expenseId, index),
          });
          showAlert('', lost > 0 ? `${done}

${t('children.carryLost', { count: lost })}` : done);
        } finally {
          setExtracting(false);
        }
      };

      if (existing.length > 0) {
        showAlert(
          t('expenseDetail.extractItemsTitle'),
          t('expenseDetail.extractItemsConfirm', { count: existing.length }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('expenses.merge.confirm'), onPress: () => void apply() },
          ],
        );
      } else {
        await apply();
      }
    } catch (e) {
      console.warn('[ReceiptSection] Extract items failed:', e);
      showAlert(t('common.error'), t('expenseDetail.extractItemsFailed'));
    } finally {
      setExtracting(false);
    }
  };

  const handleShowAttachOptions = () => {
    showAlert(
      t('expenseDetail.attachReceipt'),
      undefined,
      [
        { text: t('expenseDetail.attachFromCamera'), onPress: handleAttachFromCamera },
        { text: t('expenseDetail.attachFromGallery'), onPress: handleAttachFromGallery },
        { text: t('expenseDetail.attachAsPdf'), onPress: handleAttachAsPdf },
        { text: t('common.cancel'), style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const handleDeleteImage = () => {
    showAlert(t('expenseDetail.confirmDeleteImage'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteReceiptImage(expenseId);
          await showReceipt(null, receiptMimeType);
          await showExtraParts([]);
          setPartsLoadFailed(false);
        },
      },
    ]);
  };

  return (
    <>
      <View style={styles.imageCard}>
        <Text style={styles.imageSectionTitle}>{t('expenseDetail.receiptImage')}</Text>

        {imageLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} />
        ) : receiptUri ? (
          <>
            {isPdf ? (
              <TouchableOpacity style={styles.pdfPreview} onPress={handleShareImage}>
                <Ionicons name="document-text-outline" size={48} color={theme.colors.primary} />
                <Text style={styles.pdfPreviewText}>PDF</Text>
                <Text style={styles.pdfPreviewHint}>{t('expenseDetail.tapToOpen')}</Text>
              </TouchableOpacity>
            ) : (
              [receiptUri, ...extraUris].map((uri, i, all) => (
                <TouchableOpacity
                  key={uri}
                  onPress={() => {
                    setViewerUri(uri);
                    setImageViewVisible(true);
                  }}
                  accessibilityLabel={
                    all.length > 1 ? t('expenseDetail.receiptPartOf', { n: i + 1, total: all.length }) : undefined
                  }
                >
                  <Image source={{ uri }} style={styles.receiptThumbnail} resizeMode="cover" />
                </TouchableOpacity>
              ))
            )}
            <View style={styles.imageActions}>
              {!isPdf && (
                <TouchableOpacity style={styles.imageActionBtn} onPress={() => {
                  setViewerUri(receiptUri);
                  setImageViewVisible(true);
                }}>
                  <Ionicons name="eye-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.imageActionText}>{t('expenseDetail.viewImage')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.imageActionBtn} onPress={handleShareImage}>
                <Ionicons name="share-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.imageActionText}>{(extraUris.length > 0 ? t('expenseDetail.shareFirstPhoto') : t('expenseDetail.shareImage'))}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageActionBtn} onPress={handleSaveImage}>
                <Ionicons name="download-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.imageActionText}>{(extraUris.length > 0 ? t('expenseDetail.saveFirstPhoto') : t('expenseDetail.saveImage'))}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.imageActionBtn}
                onPress={handleExtractItems}
                disabled={extracting}
              >
                {extracting ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                )}
                <Text style={styles.imageActionText}>
                  {extracting
                    ? t('expenseDetail.extractingItems')
                    : t('expenseDetail.extractItems')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageActionBtn} onPress={handleShowAttachOptions}>
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.secondary} />
                <Text style={[styles.imageActionText, { color: theme.colors.secondary }]}>
                  {t('expenseDetail.replaceImage')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageActionBtn} onPress={handleDeleteImage}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                <Text style={[styles.imageActionText, { color: theme.colors.danger }]}>
                  {t('expenseDetail.deleteImage')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity style={styles.addImageBtn} onPress={handleShowAttachOptions}>
            <Ionicons name="image-outline" size={32} color={theme.colors.textDisabled} />
            <Text style={styles.addImageText}>{t('expenseDetail.attachReceipt')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ReceiptImageViewer
        visible={imageViewVisible && !isPdf}
        uri={viewerUri ?? receiptUri}
        onClose={() => {
          setImageViewVisible(false);
          setViewerUri(null);
        }}
      />
    </>
  );
}

const createStyles = (theme: Theme) => ({
  imageCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  imageSectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  receiptThumbnail: {
    width: '100%' as const,
    height: 200,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[3],
  },
  pdfPreview: {
    width: '100%' as const,
    height: 150,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  pdfPreviewText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.primary,
    marginTop: theme.spacing[1],
  },
  pdfPreviewHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  imageActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  imageActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  imageActionText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  addImageBtn: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed' as const,
  },
  addImageText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
});
