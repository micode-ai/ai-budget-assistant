import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useImportStore } from '@/stores/importStore';
import { useAccountStore } from '@/stores/accountStore';
import { isAiConsentLoop } from '@/utils/importConsent';
import { isTierRequiredError } from '@/services/importErrors';
import { useUpgradeStore } from '@/stores/upgradeStore';

export default function AiConsentScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const preview = useImportStore((s) => s.previewData);
  const file = useImportStore((s) => s.fileAsset);
  const setPreview = useImportStore((s) => s.setPreview);
  const setConsent = useImportStore((s) => s.setAiConsentGrantedFor);
  const accountId = useAccountStore((s) => s.currentAccountId);
  const [busy, setBusy] = useState(false);

  // Snapshotted once at mount, deliberately NOT a live subscription:
  // `accept()` below writes this same store field (`setConsent`) mid-flight,
  // between the consent grant and the retried preview request. If this read
  // a live value, that write would flip it to `true` and re-render this
  // screen with the loop-warning UI over the retry's own in-flight spinner —
  // on every single successful grant, not just the rare real loop. The
  // genuine loop is still caught: when the retried preview comes back
  // `needs_ai_consent` again, `preview.tsx` routes straight back here and the
  // screen remounts, so a fresh snapshot sees the match.
  const [loopDetected] = useState(() =>
    isAiConsentLoop(useImportStore.getState().aiConsentGrantedFor, accountId),
  );

  // The PDF path sends extracted lines rather than header cells, and sends no
  // fingerprint — that is how we tell the two apart for the disclosure copy.
  const isPdf = !preview?.headerFingerprint;

  const decline = () => router.replace('/settings/import/mapper');

  if (loopDetected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.content}>
          <Ionicons name="warning-outline" size={40} color={theme.colors.danger} />
          <Text style={styles.body}>{t('bankImport.aiConsentFailed')}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={decline} activeOpacity={0.7}>
            <Text style={styles.primaryButtonText}>{t('bankImport.aiConsentDecline')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const accept = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await api.grantAiImportConsent();
      if (accountId) setConsent(accountId);
      const res = await api.importBankPreview(file);
      setPreview(res);
      router.replace('/settings/import/preview');
    } catch (err) {
      if (isTierRequiredError(err)) {
        useUpgradeStore.getState().show(t('bankImport.aiPdfPaywall'), err.requiredTier ?? 'pro');
        setBusy(false);
        return;
      }
      showAlert(
        t('bankImport.aiConsentFailed'),
        err instanceof Error ? err.message : String(err),
      );
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="sparkles-outline" size={40} color={theme.colors.primary} />
        <Text style={styles.body}>{t('bankImport.aiConsentBody')}</Text>

        <Text style={styles.sectionTitle}>{t('bankImport.aiConsentWhatLeaves')}</Text>
        <Text style={styles.detail}>
          {isPdf ? t('bankImport.aiConsentWhatLeavesPdf') : t('bankImport.aiConsentWhatLeavesCsv')}
        </Text>
        <Text style={styles.detail}>{t('bankImport.aiConsentThirdParty')}</Text>

        <Text style={styles.footnote}>{t('bankImport.aiConsentOnce')}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={accept}
          disabled={busy}
          activeOpacity={0.7}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('bankImport.aiConsentAccept')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={decline} disabled={busy} activeOpacity={0.7}>
          <Text style={styles.secondaryButtonText}>{t('bankImport.aiConsentDecline')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
    alignItems: 'center' as const,
  },
  body: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    alignSelf: 'flex-start' as const,
    marginTop: theme.spacing[4],
  },
  detail: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    alignSelf: 'flex-start' as const,
  },
  footnote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[4],
  },
  actions: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  primaryButton: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  secondaryButton: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
  },
  secondaryButtonText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
});
