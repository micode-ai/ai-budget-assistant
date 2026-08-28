import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  isProcessing: boolean;
  imageUri: string | null;
  isPdf: boolean;
  userPrompt: string;
  onUserPromptChange: (text: string) => void;
  onCameraPress: () => void;
  onGalleryPress: () => void;
  onPdfPress: () => void;
}

/**
 * The pre-scan capture view of `app/expense/receipt.tsx` (ABA-448):
 * instructions, the optional free-text prompt, and either the processing
 * spinner (with an image/PDF preview) or the three capture buttons (camera /
 * gallery / PDF). Purely presentational — capture itself is owned by
 * `useReceiptScanner`.
 */
export default function ReceiptCaptureView({
  isProcessing,
  imageUri,
  isPdf,
  userPrompt,
  onUserPromptChange,
  onCameraPress,
  onGalleryPress,
  onPdfPress,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      <View style={styles.instructionContainer}>
        <Ionicons name="receipt-outline" size={80} color={theme.colors.primary} />
        <Text style={styles.instructionText}>
          {isProcessing ? t('receipt.analyzing') : t('receipt.instructions')}
        </Text>
        <Text style={styles.exampleText}>
          {t('receipt.hint')}
        </Text>
      </View>

      <TextInput
        style={styles.userPromptInput}
        placeholder={t('receipt.userPromptPlaceholder')}
        placeholderTextColor={theme.colors.textTertiary}
        value={userPrompt}
        onChangeText={onUserPromptChange}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />

      {isProcessing ? (
        <View style={styles.processingContainer}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          )}
          {isPdf && !imageUri && (
            <Ionicons name="document-text" size={80} color={theme.colors.primary} style={{ marginBottom: theme.spacing[6] }} />
          )}
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
          <Text style={styles.processingText}>
            {isPdf ? t('receipt.analyzingPdf') : t('receipt.extracting')}
          </Text>
        </View>
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={onCameraPress}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={32} color={theme.colors.textInverse} />
            <Text style={styles.scanButtonText}>{t('receipt.takePhoto')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.galleryButton}
            onPress={onGalleryPress}
            activeOpacity={0.8}
          >
            <Ionicons name="images" size={28} color={theme.colors.primary} />
            <Text style={styles.galleryButtonText}>{t('receipt.chooseGallery')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.galleryButton}
            onPress={onPdfPress}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text" size={28} color={theme.colors.primary} />
            <Text style={styles.galleryButtonText}>{t('receipt.choosePdf')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  instructionContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[12],
    marginTop: theme.spacing[6],
  },
  instructionText: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[6],
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  exampleText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center' as const,
  },
  userPromptInput: {
    width: '100%' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[6],
    minHeight: 60,
    maxHeight: 100,
  },
  buttonContainer: {
    width: '100%' as const,
    gap: theme.spacing[4],
  },
  scanButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[5],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.borderRadius.xl,
    gap: theme.spacing[3],
    ...theme.shadows.xl,
  },
  scanButtonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  galleryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    gap: theme.spacing[2.5],
  },
  galleryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
  },
  processingContainer: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    width: '100%' as const,
  },
  previewImage: {
    width: 200,
    height: 280,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[6],
  },
  loader: {
    marginBottom: theme.spacing[4],
  },
  processingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
});
