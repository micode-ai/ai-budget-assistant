import { View, Text, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { MAX_RECEIPT_PARTS, canScan, remainingParts, type ScanPart } from '@/features/receipt/receiptParts';
import ReceiptPartsDropZone from '@/components/receipt/ReceiptPartsDropZone';

interface Props {
  parts: ScanPart[];
  /** A captured part is still being downscaled. */
  isPreparingPart: boolean;
  onCameraPress: () => void;
  onGalleryPress: () => void;
  /** Desktop web drop: object URLs of the dropped images, in drop order; resolves with the ones safe to revoke. */
  onDropUris: (uris: string[]) => Promise<string[]>;
  onRemovePart: (index: number) => void;
  onReadReceipt: () => void;
  /** Leave the long-receipt flow (drops the parts) for the ordinary single photo. */
  onExit: () => void;
}

/**
 * Long receipt in several photos: the capture step. Parts are collected top to
 * bottom (max 4) as thumbnails with a remove button; nothing is scanned until
 * "Read receipt", which reads them all in ONE scan. Shared by phone and desktop
 * web; the only platform piece is the drop zone (`ReceiptPartsDropZone.web.tsx`,
 * nothing on native).
 */
export default function ReceiptPartsCapture({
  parts,
  isPreparingPart,
  onCameraPress,
  onGalleryPress,
  onDropUris,
  onRemovePart,
  onReadReceipt,
  onExit,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const full = remainingParts(parts) === 0;
  const busy = isPreparingPart;

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{t('receipt.partsHint')}</Text>
      <Text style={styles.progress}>{t('receipt.partsProgress', { current: parts.length, max: MAX_RECEIPT_PARTS })}</Text>

      {(parts.length > 0 || busy) && (
        <ScrollView horizontal style={styles.thumbs} contentContainerStyle={styles.thumbsContent}>
          {parts.map((p, index) => (
            <View key={`${index}-${p.uri}`} style={styles.thumb}>
              <Image source={{ uri: p.uri }} style={styles.thumbImage} />
              <Text style={styles.thumbIndex}>{index + 1}</Text>
              <TouchableOpacity
                style={styles.thumbRemove}
                onPress={() => onRemovePart(index)}
                accessibilityRole="button"
                accessibilityLabel={t('receipt.removePart', { index: index + 1 })}
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color={theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
          ))}
          {busy && (
            <View style={[styles.thumb, styles.thumbPending]}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          )}
        </ScrollView>
      )}

      {!full && (
        <View style={styles.addRow}>
          <TouchableOpacity
            style={[styles.addButton, busy && styles.disabled]}
            onPress={onCameraPress}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={22} color={theme.colors.primary} />
            <Text style={styles.addButtonText} numberOfLines={1}>
              {parts.length === 0 ? t('receipt.takePhoto') : t('receipt.addNextPart')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, styles.addButtonSmall, busy && styles.disabled]}
            onPress={onGalleryPress}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('receipt.chooseGallery')}
          >
            <Ionicons name="images" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {!full && <ReceiptPartsDropZone disabled={busy} onDropUris={onDropUris} />}

      <TouchableOpacity
        style={[styles.readButton, (!canScan(parts) || busy) && styles.disabled]}
        onPress={onReadReceipt}
        disabled={!canScan(parts) || busy}
        activeOpacity={0.8}
      >
        <Ionicons name="sparkles" size={22} color={theme.colors.textInverse} />
        <Text style={styles.readButtonText}>{t('receipt.readReceipt')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.exitButton} onPress={onExit}>
        <Text style={styles.exitButtonText}>{t('receipt.singlePhoto')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const THUMB_W = 72;
const THUMB_H = 100;

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    gap: theme.spacing[4],
  },
  hint: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  progress: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginTop: -theme.spacing[2],
  },
  thumbs: {
    flexGrow: 0,
  },
  thumbsContent: {
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  thumbPending: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  thumbImage: {
    width: THUMB_W,
    height: THUMB_H,
  },
  thumbIndex: {
    position: 'absolute' as const,
    left: 4,
    bottom: 4,
    minWidth: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.primary,
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },
  thumbRemove: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  addRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  addButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  addButtonSmall: {
    flex: 0,
    paddingHorizontal: theme.spacing[5],
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
    flexShrink: 1,
  },
  readButton: {
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
  readButtonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  disabled: {
    opacity: 0.5,
  },
  exitButton: {
    alignSelf: 'center' as const,
    padding: theme.spacing[3],
  },
  exitButtonText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline' as const,
  },
});
