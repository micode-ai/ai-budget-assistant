import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import type { GroupDetail } from '@budget/shared-types';
import { GroupLinkQrModal } from './GroupLinkQrModal';

/** The invite link: copy, share sheet and QR. Hidden for an archived group. */
export function GroupShareCard({ detail }: { detail: GroupDetail }) {
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
    </View>
  );
}

const createStyles = (theme: Theme) => ({
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
