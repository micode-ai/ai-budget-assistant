import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { collectSupportContext } from '@/features/support/collectSupportContext';
import { SUPPORT_MESSAGE_MAX_LENGTH } from '@/features/support/supportDisplay';
import type { UseSupportThreadReturn } from '@/features/support/useSupportThread';

interface Props {
  support: UseSupportThreadReturn;
  fromRoute?: string;
  /**
   * Bottom padding under the privacy line. The phone passes `insets.bottom`
   * (edge-to-edge: without it the send row sits under a three-button nav bar,
   * ABA-483); the desktop passes 0.
   */
  bottomInset: number;
  /** Desktop caps the composer's row at the reading column; the phone leaves it full width. */
  columnWidth?: number;
}

/** Show the remaining-characters counter only near the limit. */
const COUNTER_FROM = SUPPORT_MESSAGE_MAX_LENGTH - 300;

/**
 * Banners (offline, send error), the input, the collapsed "Attached: …" line
 * and the privacy line. One definition for both platforms.
 */
export function SupportComposer({ support, fromRoute, bottomInset, columnWidth }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [attachedOpen, setAttachedOpen] = useState(false);

  const { draft, setDraft, send, sending, sendError, isOffline } = support;
  const canSend = !isOffline && !sending && draft.trim().length > 0 && draft.length <= SUPPORT_MESSAGE_MAX_LENGTH;
  const handleSend = () => {
    if (canSend) void send(draft);
  };

  // What is actually attached — computed only when the user asks to see it.
  const attached = useMemo(
    () => (attachedOpen ? collectSupportContext(fromRoute) : null),
    [attachedOpen, fromRoute],
  );

  const rowWidth = columnWidth ? { width: columnWidth, alignSelf: 'center' as const } : null;

  return (
    <View style={[styles.container, { paddingBottom: theme.spacing[2] + bottomInset }]}>
      <View style={rowWidth}>
        {isOffline && (
          <View style={[styles.banner, styles.bannerWarning]}>
            <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.bannerText}>{t('support.offline')}</Text>
          </View>
        )}
        {!isOffline && sendError && (
          <View style={[styles.banner, styles.bannerDanger]} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
            <Text style={styles.bannerText}>{t(sendError)}</Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('support.placeholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
            editable={!sending}
            accessibilityLabel={t('support.placeholder')}
            // Web only: multiline is a <textarea>, where Enter sends and Shift+Enter is a
            // newline (the chat composer's rule). On a phone Return must stay a newline —
            // a native multiline input reports Enter for it and cannot be prevented.
            onKeyPress={
              Platform.OS === 'web'
                ? (e: any) => {
                    if (e?.nativeEvent?.key === 'Enter' && !e?.nativeEvent?.isComposing && !e?.shiftKey && !e?.nativeEvent?.shiftKey) {
                      e.preventDefault?.();
                      handleSend();
                    }
                  }
                : undefined
            }
          />
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={t('support.send')}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <Ionicons name="send" size={18} color={theme.colors.textInverse} />
            )}
          </TouchableOpacity>
        </View>

        {draft.length >= COUNTER_FROM && (
          <Text style={styles.counter}>
            {t('support.charsLeft', { n: SUPPORT_MESSAGE_MAX_LENGTH - draft.length })}
          </Text>
        )}

        <TouchableOpacity
          onPress={() => setAttachedOpen((v) => !v)}
          style={styles.attachedRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: attachedOpen }}
        >
          <Ionicons name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
          <Text style={styles.footnote}>{t('support.attachedCollapsed')}</Text>
          <Ionicons name={attachedOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        {attached && (
          <View style={styles.attachedList}>
            <Text style={styles.footnote}>
              {t('support.attachedVersion')}: {attached.appVersion}
              {attached.buildSha ? ` (${attached.buildSha})` : ''}
            </Text>
            <Text style={styles.footnote}>
              {t('support.attachedDevice')}: {attached.platform}
              {attached.osVersion ? ` ${attached.osVersion}` : ''}
            </Text>
            <Text style={styles.footnote}>
              {t('support.attachedLanguage')}: {attached.locale}
            </Text>
            {attached.tier && (
              <Text style={styles.footnote}>
                {t('support.attachedPlan')}: {attached.tier}
              </Text>
            )}
            {attached.accountType && (
              <Text style={styles.footnote}>
                {t('support.attachedAccountType')}: {attached.accountType}
              </Text>
            )}
            {attached.fromRoute && (
              <Text style={styles.footnote}>
                {t('support.attachedScreen')}: {attached.fromRoute}
              </Text>
            )}
          </View>
        )}
        <Text style={[styles.footnote, styles.privacy]}>{t('support.privacy')}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.background,
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  bannerWarning: {
    backgroundColor: theme.colors.warningLight,
  },
  bannerDanger: {
    backgroundColor: theme.colors.dangerLight,
  },
  bannerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    minHeight: 44,
    maxHeight: 140,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  counter: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'right' as const,
    marginTop: theme.spacing[1],
  },
  attachedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
    alignSelf: 'flex-start' as const,
  },
  attachedList: {
    marginTop: theme.spacing[1],
    marginLeft: theme.spacing[4],
  },
  footnote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  privacy: {
    marginTop: theme.spacing[1],
  },
});
