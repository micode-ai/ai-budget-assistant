import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { useTheme, useStyles, type Theme } from '@/theme';

interface GroupLinkQrModalProps {
  visible: boolean;
  url: string;
  onClose: () => void;
}

/**
 * Bottom sheet with one QR code for the group link. `GroupQrModal` (receipt split) carries
 * receipt-split copy and a names-only-picker hint, so groups get their own sheet over the same
 * `react-native-qrcode-svg` renderer. The sheet clears the system navigation bar (ABA-483).
 */
export function GroupLinkQrModal({ visible, url, onClose }: GroupLinkQrModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: theme.spacing[6] + insets.bottom }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{t('groups.qrTitle')}</Text>
          <View style={styles.qr}>
            <QRCode value={url} size={220} backgroundColor="#FFFFFF" color="#000000" />
          </View>
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    alignItems: 'center' as const,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  qr: {
    // A QR code needs a light quiet zone in dark mode too, or phone cameras cannot read it.
    backgroundColor: '#FFFFFF',
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
  },
  close: {
    marginTop: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[8],
  },
  closeText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
});
