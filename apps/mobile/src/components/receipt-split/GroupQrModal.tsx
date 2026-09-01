import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';

interface GroupQrModalProps {
  visible: boolean;
  /** The group picker URL — always a non-empty string while `visible` is
   * true; the caller (ParticipantStatusList) only ever opens this modal from
   * a "Show QR" button that is itself hidden when `split.groupUrl` is null. */
  groupUrl: string;
  onClose: () => void;
  onShare: () => void;
}

/**
 * Kiosk-style bottom sheet for the payer's own device: one QR code that
 * every participant at the table can scan to reach the names-only picker
 * page (ABA — QR-code bill split). Same visual pattern as
 * `src/components/home/SafeToSpendSheet.tsx` — backdrop + slide-up card,
 * handle bar, single Done action.
 */
export function GroupQrModal({ visible, groupUrl, onClose, onShare }: GroupQrModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  async function handleCopy() {
    try {
      await Clipboard.setStringAsync(groupUrl);
      showAlert(t('common.success'));
    } catch (e) {
      console.warn('[GroupQrModal] copy failed', e);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('receiptSplit.qrTitle')}</Text>
          <Text style={styles.hint}>{t('receiptSplit.qrHint')}</Text>

          <View style={styles.qrContainer}>
            <QRCode
              value={groupUrl}
              size={220}
              backgroundColor={theme.colors.surface}
              color={theme.colors.textPrimary}
            />
          </View>

          <TouchableOpacity style={styles.linkRow} onPress={handleCopy} activeOpacity={0.7}>
            <Text style={styles.linkText} numberOfLines={1}>
              {groupUrl}
            </Text>
            <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareBtn} onPress={onShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.shareText}>{t('receiptSplit.qrShare')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
    paddingBottom: theme.spacing[8],
    paddingTop: theme.spacing[3],
    alignItems: 'center' as const,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[5],
  },
  qrContainer: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  linkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    maxWidth: '100%' as const,
  },
  linkText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    flexShrink: 1,
  },
  shareBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginTop: theme.spacing[4],
    alignSelf: 'stretch' as const,
  },
  shareText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  closeButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
    marginTop: theme.spacing[5],
    alignSelf: 'stretch' as const,
  },
  closeText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
});
