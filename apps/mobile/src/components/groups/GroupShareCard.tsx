import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import type { GroupDetail } from '@budget/shared-types';
import { GroupLinkQrModal } from './GroupLinkQrModal';

/**
 * The invite link: copy, share sheet and QR. Hidden for an archived group.
 * `desktop` (ABA-646, default false so the phone call is unchanged) draws the QR inline and drops
 * the Share button: `Share.share` is unreliable in desktop browsers and falls back to copying
 * anyway, and the rail has room for the QR that the phone keeps behind a button.
 */
export function GroupShareCard({ detail, desktop = false }: { detail: GroupDetail; desktop?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [qrOpen, setQrOpen] = useState(false);
  const url = detail.guestUrl;

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      showAlert(t('groups.linkCopied'));
    } catch (e) {
      console.warn('[GroupShareCard] copy failed', e);
    }
  };

  const share = async () => {
    try {
      await Share.share({ message: t('groups.shareMessage', { name: detail.name, url }) });
    } catch (e) {
      // The share sheet is unavailable on some web browsers; copying is the honest fallback.
      console.warn('[GroupShareCard] share failed', e);
      await copy();
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('groups.shareTitle')}</Text>
      <Text style={styles.hint}>{t('groups.shareHint')}</Text>
      {!detail.guestAccess && <Text style={styles.warning}>{t('groups.guestLinkOff')}</Text>}
      {desktop ? (
        <>
          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>
              {url}
            </Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={copy} accessibilityRole="button">
            <Ionicons name="copy-outline" size={16} color={theme.colors.textInverse} />
            <Text style={styles.primaryButtonText}>{t('groups.copyLink')}</Text>
          </TouchableOpacity>
          <Text style={styles.qrTitle}>{t('groups.qrTitle')}</Text>
          <View style={styles.qr}>
            <QRCode value={url} size={220} backgroundColor="#FFFFFF" color="#000000" />
          </View>
        </>
      ) : (
        <>
      <TouchableOpacity style={styles.linkRow} onPress={copy} activeOpacity={0.7}>
        <Text style={styles.linkText} numberOfLines={1}>
          {url}
        </Text>
        <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
      </TouchableOpacity>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.button} onPress={copy}>
          <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.buttonText}>{t('groups.copyLink')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={share}>
          <Ionicons name="share-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.buttonText}>{t('groups.shareLink')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setQrOpen(true)}>
          <Ionicons name="qr-code-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.buttonText}>{t('groups.showQr')}</Text>
        </TouchableOpacity>
      </View>
      <GroupLinkQrModal visible={qrOpen} url={url} onClose={() => setQrOpen(false)} />
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
  },
  qrTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
  },
  qr: {
    // A QR code needs a light quiet zone in dark mode too, or phone cameras cannot read it.
    alignSelf: 'center' as const,
    backgroundColor: '#FFFFFF',
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  warning: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    marginTop: theme.spacing[2],
  },
  linkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  linkText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  buttons: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  buttonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
