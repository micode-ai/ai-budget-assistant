import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InboundReceiptDetail } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ReceiptExpenseView } from '@/components/receipt/ReceiptExpenseView';
import { useInboundReceiptStore } from '@/stores/inboundReceiptStore';
import { api } from '@/services/api';
import { blobToDocumentUri } from '@/features/inboundMail/documentUri';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; messageKey: string }
  | { kind: 'ready'; detail: InboundReceiptDetail; documentUri: string | null };

/**
 * Opens one pending e-mail item in the EXISTING receipt confirm card (ABA-644):
 * fetch the detail (the server recomputes `possibleDuplicate`), download the image
 * document when there is one, then host `ReceiptExpenseView` seeded from it. Saving
 * is the ordinary receipt save; once the expense exists the store confirms the item
 * against the new expense's client id.
 */
export function EmailReceiptConfirm({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const detail = await useInboundReceiptStore.getState().getDetail(id);
      if (detail.status !== 'pending') {
        setPhase({ kind: 'error', messageKey: 'itemNotPending' });
        return;
      }
      let documentUri: string | null = null;
      if (detail.documentKind === 'image' && detail.hasDocument) {
        try {
          documentUri = await blobToDocumentUri(await api.downloadInboundReceiptDocument(id), id);
        } catch (e) {
          // The card still works without the preview; the receipt just is not stored.
          console.warn('[EmailReceiptConfirm] document download failed:', e);
        }
      }
      setPhase({ kind: 'ready', detail, documentUri });
    } catch (e) {
      const status = (e as { status?: number }).status;
      setPhase({ kind: 'error', messageKey: status === 404 ? 'itemGone' : 'loadFailed' });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase.kind === 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <ReceiptExpenseView
          onDone={() => router.back()}
          inbound={{
            detail: phase.detail,
            documentUri: phase.documentUri,
            onSaved: (expenseId) => void useInboundReceiptStore.getState().markSaved(id, expenseId),
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.center}>
        {phase.kind === 'loading' ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <>
            <Text style={styles.message}>{t(`emailReceipts.${phase.messageKey}`)}</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.back()}>
              <Text style={styles.buttonText}>{t('common.back')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: theme.spacing[6], gap: theme.spacing[4] },
  message: { ...theme.textStyles.bodyLarge, color: theme.colors.textSecondary, textAlign: 'center' as const },
  button: {
    minHeight: 44,
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  buttonText: { ...theme.textStyles.button, color: theme.colors.textInverse },
});
