import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';
import { useInboundReceiptStore } from '@/stores/inboundReceiptStore';
import { addressErrorKey } from '@/features/inboundMail/inboundMail';
import { SettingsScreenScroll } from '../SettingsScreenScroll';
import { useSettingsPane } from '../SettingsPaneContext';
import { VerificationCodeCard } from './VerificationCodeCard';
import { ForwardingGuide } from './ForwardingGuide';

/** How often the Gmail verification code is looked for while this screen is focused. */
const VERIFICATION_POLL_MS = 8000;

/**
 * Settings -> E-mail receipts (ABA-644): the user's private forwarding address,
 * its target account, rotate/disable, the Gmail verification code and the
 * forwarding guide.
 *
 * Hosted by `SettingsRoute`, so it is a pane on desktop web and a full page
 * elsewhere. Unlike `BotsSettings` it does poll - but only while the route is
 * focused: the interval is created and cleared by `useFocusEffect`, so a pane that
 * stays mounted behind another screen never keeps it running.
 */
export function EmailReceiptsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { bottomInset } = useSettingsPane();

  const availability = useInboundReceiptStore((s) => s.availability);
  const address = useInboundReceiptStore((s) => s.address);
  const addressLoaded = useInboundReceiptStore((s) => s.addressLoaded);
  const accounts = useAccountStore((s) => s.accounts);
  const canEdit = useAccountStore((s) => s.canEdit());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const { loadAddress } = useInboundReceiptStore.getState();
      void loadAddress();
      const timer = setInterval(() => void loadAddress(), VERIFICATION_POLL_MS);
      return () => clearInterval(timer);
    }, []),
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      showAlert(t('common.error'), t(`emailReceipts.${addressErrorKey(e)}`));
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address.address);
    setCopied(true);
  };

  const confirmRotate = () =>
    showAlert(t('emailReceipts.rotateConfirmTitle'), t('emailReceipts.rotateConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('emailReceipts.rotate'),
        style: 'destructive',
        onPress: () => void run(() => useInboundReceiptStore.getState().rotateAddress()),
      },
    ]);

  const confirmDisable = () =>
    showAlert(t('emailReceipts.disableConfirmTitle'), t('emailReceipts.disableConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('emailReceipts.disable'),
        style: 'destructive',
        onPress: () => void run(() => useInboundReceiptStore.getState().disableAddress()),
      },
    ]);

  const targets = accounts.filter((a) => a.myRole === 'owner' || a.myRole === 'editor');

  const body = () => {
    if (availability === 'unavailable') {
      return <Text style={styles.muted}>{t('emailReceipts.unavailable')}</Text>;
    }
    if (!addressLoaded) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <>
        <Text style={styles.intro}>{t('emailReceipts.intro')}</Text>

        {!address ? (
          <View style={styles.card}>
            {canEdit ? (
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.disabled]}
                disabled={busy}
                onPress={() => void run(() => useInboundReceiptStore.getState().createAddress())}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('emailReceipts.createAddress')}</Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text style={styles.muted}>{t('emailReceipts.viewerNote')}</Text>
            )}
          </View>
        ) : (
          <>
            {address.pendingVerification && (
              <VerificationCodeCard code={address.pendingVerification.code} />
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('emailReceipts.yourAddress')}</Text>
              <View style={styles.card}>
                <Text style={styles.address} selectable>
                  {address.address}
                </Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={copyAddress}>
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={18}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.secondaryButtonText}>
                    {copied ? t('emailReceipts.copied') : t('emailReceipts.copy')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('emailReceipts.targetTitle')}</Text>
              <View style={styles.card}>
                <Text style={styles.hint}>{t('emailReceipts.targetHint')}</Text>
                {targets.map((account) => {
                  const selected = account.id === address.targetAccountId;
                  return (
                    <TouchableOpacity
                      key={account.id}
                      style={styles.targetRow}
                      disabled={busy || !canEdit}
                      onPress={() => {
                        if (!selected) {
                          void run(() => useInboundReceiptStore.getState().setTarget(account.id));
                        }
                      }}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={selected ? theme.colors.primary : theme.colors.textTertiary}
                      />
                      <Text style={styles.targetName} numberOfLines={1}>
                        {account.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {canEdit && (
              <View style={styles.section}>
                <View style={styles.card}>
                  <TouchableOpacity style={styles.rowAction} disabled={busy} onPress={confirmRotate}>
                    <Ionicons name="refresh-outline" size={20} color={theme.colors.textPrimary} />
                    <Text style={styles.rowActionText}>{t('emailReceipts.rotate')}</Text>
                  </TouchableOpacity>
                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.rowAction} disabled={busy} onPress={confirmDisable}>
                    <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
                    <Text style={[styles.rowActionText, { color: theme.colors.danger }]}>
                      {t('emailReceipts.disable')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.inboxLink}
              onPress={() => router.push('/inbox/email-receipts' as any)}
            >
              <Ionicons name="mail-open-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.inboxLinkText}>{t('emailReceipts.openInbox')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('emailReceipts.disclosureTitle')}</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>{t('emailReceipts.disclosureBody')}</Text>
          </View>
        </View>

        <ForwardingGuide />
      </>
    );
  };

  return (
    <SettingsScreenScroll
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + bottomInset }]}
    >
      {body()}
    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4] },
  centered: { alignItems: 'center' as const, justifyContent: 'center' as const, minHeight: 80 },
  intro: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginBottom: theme.spacing[4] },
  section: { marginBottom: theme.spacing[6] },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  muted: { ...theme.textStyles.body, color: theme.colors.textTertiary },
  hint: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  address: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[4],
  },
  primaryButtonText: { ...theme.textStyles.button, color: theme.colors.textInverse },
  disabled: { opacity: 0.6 },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    alignSelf: 'flex-start' as const,
    minHeight: 36,
  },
  secondaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  targetRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 44,
  },
  targetName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  rowAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 40,
  },
  rowActionText: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2] },
  inboxLink: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[6],
  },
  inboxLinkText: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
});
