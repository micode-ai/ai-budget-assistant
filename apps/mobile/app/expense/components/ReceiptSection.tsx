import { useState, useCallback, useEffect } from 'react';
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
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
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

  const [receiptImageBase64, setReceiptImageBase64] = useState<string | null>(null);
  const [receiptMimeType, setReceiptMimeType] = useState<string>('image/jpeg');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);

  const isPdf = receiptMimeType === 'application/pdf';
  const fileExt = isPdf ? 'pdf' : 'jpg';

  const handleLoadReceiptImage = useCallback(async () => {
    setImageLoading(true);
    const result = await loadReceiptImage(expenseId);
    if (result) {
      setReceiptImageBase64(result.base64);
      setReceiptMimeType(result.mimeType);
    } else {
      setReceiptImageBase64(null);
    }
    setImageLoading(false);
  }, [expenseId, loadReceiptImage]);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      handleLoadReceiptImage();
    });
    return () => handle.cancel();
  }, [expenseId, handleLoadReceiptImage]);

  const handleShareImage = async () => {
    if (!receiptImageBase64) return;
    const file = new File(Paths.cache, `receipt-${expenseId}.${fileExt}`);
    file.write(receiptImageBase64, { encoding: 'base64' });
    await Sharing.shareAsync(file.uri, { mimeType: receiptMimeType });
  };

  const handleSaveImage = async () => {
    if (!receiptImageBase64) return;
    if (isPdf) return handleShareImage();
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('common.error'), t('expenseDetail.galleryPermissionDenied'));
      return;
    }
    const file = new File(Paths.cache, `receipt-${expenseId}.jpg`);
    file.write(receiptImageBase64, { encoding: 'base64' });
    await MediaLibrary.saveToLibraryAsync(file.uri);
    showAlert('', t('expenseDetail.imageSaved'));
  };

  const compressImageToBase64 = async (uri: string): Promise<string> => {
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
    );
    const compressedFile = new File(compressed.uri);
    return await compressedFile.base64();
  };

  const handleAttachFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('common.error'), t('expenseDetail.cameraPermissionDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const base64 = await compressImageToBase64(result.assets[0].uri);
    await saveReceiptImage(expenseId, base64, 'image/jpeg');
    setReceiptImageBase64(base64);
    setReceiptMimeType('image/jpeg');
  };

  const handleAttachFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const base64 = await compressImageToBase64(result.assets[0].uri);
    await saveReceiptImage(expenseId, base64, 'image/jpeg');
    setReceiptImageBase64(base64);
    setReceiptMimeType('image/jpeg');
  };

  const handleAttachAsPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const file = new File(asset.uri);
    const base64 = await file.base64();
    await saveReceiptImage(expenseId, base64, 'application/pdf');
    setReceiptImageBase64(base64);
    setReceiptMimeType('application/pdf');
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
          setReceiptImageBase64(null);
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
        ) : receiptImageBase64 ? (
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
                  source={{ uri: `data:image/jpeg;base64,${receiptImageBase64}` }}
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
          {receiptImageBase64 && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${receiptImageBase64}` }}
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
