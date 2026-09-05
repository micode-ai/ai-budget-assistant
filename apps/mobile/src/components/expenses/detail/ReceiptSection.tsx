import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
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
import { compressAndEncodeImage } from '@/features/receipt/receiptImage';
import { materializeReceipt, releaseReceipt } from '@/features/receipt/receiptImageCache';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ReceiptSectionProps {
  expenseId: string;
}

export function ReceiptSection({ expenseId }: ReceiptSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { loadReceiptImage, saveReceiptImage, deleteReceiptImage } = useExpenseStore();

  // The receipt lives on disk, not in state. Holding the base64 here kept a
  // multi-megabyte string alive for as long as the screen did, and rendering it
  // as a `data:` URL forced <Image> to decode the full-resolution bitmap even
  // for the 200pt thumbnail. A file URI lets Fresco sample it down to the size
  // actually on screen.
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMimeType, setReceiptMimeType] = useState<string>('image/jpeg');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const receiptUriRef = useRef<string | null>(null);

  const isPdf = receiptMimeType === 'application/pdf';

  const showReceipt = useCallback(
    async (base64: string | null, mimeType: string) => {
      const previous = receiptUriRef.current;
      const next = base64 ? (await materializeReceipt(expenseId, base64, mimeType)).uri : null;
      receiptUriRef.current = next;
      setReceiptMimeType(mimeType);
      setReceiptUri(next);
      if (previous && previous !== next) void releaseReceipt(previous);
    },
    [expenseId],
  );

  const handleLoadReceiptImage = useCallback(async () => {
    setImageLoading(true);
    try {
      const result = await loadReceiptImage(expenseId);
      await showReceipt(result?.base64 ?? null, result?.mimeType ?? 'image/jpeg');
    } catch (e) {
      console.warn('[ReceiptSection] Failed to load receipt image:', e);
      await showReceipt(null, 'image/jpeg');
    } finally {
      setImageLoading(false);
    }
  }, [expenseId, loadReceiptImage, showReceipt]);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      handleLoadReceiptImage();
    });
    return () => handle.cancel();
  }, [expenseId, handleLoadReceiptImage]);

  // Drop the cached copy when the screen is gone for good, so viewing many
  // receipts does not leave one file per expense behind in the cache dir.
  useEffect(
    () => () => {
      void releaseReceipt(receiptUriRef.current);
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
              <TouchableOpacity onPress={() => setImageViewVisible(true)}>
                <Image
                  source={{ uri: receiptUri }}
                  style={styles.receiptThumbnail}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
            <View style={styles.imageActions}>
              {!isPdf && (
                <TouchableOpacity style={styles.imageActionBtn} onPress={() => setImageViewVisible(true)}>
                  <Ionicons name="eye-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.imageActionText}>{t('expenseDetail.viewImage')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.imageActionBtn} onPress={handleShareImage}>
                <Ionicons name="share-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.imageActionText}>{t('expenseDetail.shareImage')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageActionBtn} onPress={handleSaveImage}>
                <Ionicons name="download-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.imageActionText}>{t('expenseDetail.saveImage')}</Text>
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

      <Modal visible={imageViewVisible} transparent animationType="fade">
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity style={styles.imageModalClose} onPress={() => setImageViewVisible(false)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          {imageViewVisible && receiptUri && (
            <Image
              source={{ uri: receiptUri }}
              style={styles.imageModalFull}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
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
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  imageModalClose: {
    position: 'absolute' as const,
    top: 50,
    right: 20,
    zIndex: 10,
  },
  imageModalFull: {
    width: '95%' as const,
    height: '80%' as const,
  },
});
