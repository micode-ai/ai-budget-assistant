import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useTelegramBot } from '@/hooks/useTelegramBot';
import { useWhatsAppBot } from '@/hooks/useWhatsAppBot';
import { useSlackBot } from '@/hooks/useSlackBot';
import { SettingsScreenScroll } from '../SettingsScreenScroll';
import { useSettingsPane } from '../SettingsPaneContext';

/**
 * The chat-bot link settings body: connect this account to the Telegram,
 * WhatsApp and Slack bots, each through a short-lived link code, and unlink
 * again.
 *
 * Lifted out of `app/settings/bots.tsx` unchanged so the desktop settings shell
 * can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * **Nothing here outlives its mount, and that had to be established rather than
 * assumed.** A pane is a real route, but `SettingsNav` reaches it with
 * `router.push`, and a stack push does not unmount the screen beneath it - so
 * this component stays mounted for as long as the shell is open on another
 * pane. Anything periodic or any held handle would therefore keep running
 * behind a screen the user has left, which is exactly how the voice extraction
 * found a microphone still open. This screen has neither: there is no
 * `setInterval`, no `setTimeout`, no listener and no native resource in it or
 * in `useTelegramBot`/`useWhatsAppBot`/`useSlackBot`. Its three hooks each fetch
 * link status once on mount and again on focus, and the QR code is a pure SVG
 * render. **Do not add a poll here.** If live status ever needs one, it belongs
 * behind an explicit unsubscribe, and this screen's mount lifetime stops being
 * the same thing as the user looking at it.
 *
 * The refresh on return is `useFocusEffect`, and it keeps working in a pane for
 * one structural reason: the selection is the URL, so switching panes really
 * does blur this route and coming back really does focus it. Had the shell
 * swapped panes inside a single route, that refresh would have gone silently
 * dead.
 *
 * Two differences from the original body, both required by the hosting. The
 * outer `SafeAreaView` is gone - `SettingsScreenFrame` supplies it on the
 * full-page path - and the root `ScrollView` is `SettingsScreenScroll`, the
 * same `ScrollView` full-page and a plain `View` in a pane, because the shell
 * owns the page scroll. That `ScrollView` carried only `style` and
 * `contentContainerStyle`, so no prop here becomes inert in a pane.
 *
 * The one judgement call: this screen's `SafeAreaView` was `edges={['bottom']}`
 * where every screen extracted before it was `edges={[]}`, so the frame's
 * `edges={[]}` would have quietly dropped the system bottom inset from a screen
 * whose last control is a button. It is composed back in from
 * `useSettingsPane().bottomInset` instead - the sanctioned route, per
 * `SettingsScreenScroll` - which keeps the last button the same distance clear
 * of the navigation bar on a phone, and adds nothing in a pane, where the shell
 * has already accounted for it.
 */
export function BotsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { bottomInset } = useSettingsPane();

  const telegram = useTelegramBot();
  const whatsapp = useWhatsAppBot();
  const slack = useSlackBot();

  return (
    <SettingsScreenScroll
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + bottomInset }]}
    >

      {/* ── Telegram section ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.telegram.title')}</Text>
        <View style={styles.card}>
          {telegram.linked ? (
            <>
              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t('settings.telegram.linked')}</Text>
                  {telegram.username && (
                    <Text style={styles.fieldDesc}>@{telegram.username}</Text>
                  )}
                </View>
                <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.fieldRow} onPress={telegram.unlink}>
                <Text style={[styles.fieldLabel, { color: theme.colors.danger }]}>
                  {t('settings.telegram.disconnect')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[3] }]}>
                {t('settings.telegram.description')}
              </Text>
              {telegram.linkCode ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.fieldRow,
                      {
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.borderRadius.md,
                        padding: theme.spacing[3],
                      },
                    ]}
                    onPress={telegram.copyCode}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { fontSize: 24, letterSpacing: 4, textAlign: 'center' },
                        ]}
                      >
                        {telegram.linkCode}
                      </Text>
                      <Text
                        style={[
                          styles.fieldDesc,
                          { textAlign: 'center', marginTop: theme.spacing[1] },
                        ]}
                      >
                        {t('settings.telegram.tapToCopy')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={[styles.fieldDesc, { marginTop: theme.spacing[3] }]}>
                    {t('settings.telegram.linkInstructions', {
                      botUsername: telegram.botUsername || 'BudgetBot',
                    })}
                  </Text>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.fieldRow, { justifyContent: 'center' }]}
                  onPress={telegram.generateCode}
                  disabled={telegram.loading}
                >
                  {telegram.loading ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name="paper-plane-outline"
                        size={20}
                        color={theme.colors.primary}
                        style={{ marginRight: theme.spacing[2] }}
                      />
                      <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                        {t('settings.telegram.connect')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── WhatsApp section ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('whatsappBot.title')}</Text>

        {whatsapp.statusLoading ? (
          <View style={[styles.card, styles.centered]}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : whatsapp.status?.linked ? (
          /* ── Linked state ── */
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>
                  {t('whatsappBot.linkedAs', {
                    name: whatsapp.status.waProfileName ?? whatsapp.status.waPhoneNumber ?? '',
                  })}
                </Text>
                {whatsapp.status.waPhoneNumber && whatsapp.status.waProfileName && (
                  <Text style={styles.fieldDesc}>{whatsapp.status.waPhoneNumber}</Text>
                )}
              </View>
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={whatsapp.refresh}
              disabled={whatsapp.statusLoading}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={theme.colors.primary}
                style={styles.actionIcon}
              />
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                {t('whatsappBot.refresh')}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={whatsapp.unlink}
              disabled={whatsapp.unlinkLoading}
            >
              {whatsapp.unlinkLoading ? (
                <ActivityIndicator size="small" color={theme.colors.danger} />
              ) : (
                <>
                  <Ionicons
                    name="unlink-outline"
                    size={18}
                    color={theme.colors.danger}
                    style={styles.actionIcon}
                  />
                  <Text style={[styles.fieldLabel, { color: theme.colors.danger }]}>
                    {t('whatsappBot.disconnectButton')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Not linked state ── */
          <View style={styles.card}>
            {whatsapp.linkCode ? (
              <>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                  {t('whatsappBot.codeInstructions')}
                </Text>

                {/* QR code */}
                <View style={styles.qrContainer}>
                  <QRCode
                    value={whatsapp.getQrUrl()}
                    size={220}
                    backgroundColor={theme.colors.surface}
                    color={theme.colors.textPrimary}
                  />
                </View>

                {/* Code text */}
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{whatsapp.linkCode.code}</Text>
                </View>

                {/* Action buttons */}
                <TouchableOpacity style={styles.primaryButton} onPress={whatsapp.openWhatsApp}>
                  <Ionicons
                    name="logo-whatsapp"
                    size={20}
                    color="#ffffff"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.primaryButtonText}>{t('whatsappBot.openButton')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryButton} onPress={whatsapp.copyCode}>
                  <Ionicons
                    name="copy-outline"
                    size={18}
                    color={theme.colors.primary}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.secondaryButtonText}>{t('whatsappBot.copyCode')}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.fieldRow} onPress={whatsapp.refresh}>
                  <Ionicons
                    name="refresh-outline"
                    size={18}
                    color={theme.colors.primary}
                    style={styles.actionIcon}
                  />
                  <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                    {t('whatsappBot.refresh')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                  {t('whatsappBot.subtitle')}
                </Text>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[3] }]}>
                  {t('whatsappBot.notLinked')}
                </Text>
                <TouchableOpacity
                  style={[styles.fieldRow, { justifyContent: 'center' }]}
                  onPress={whatsapp.generateCode}
                  disabled={whatsapp.codeLoading}
                >
                  {whatsapp.codeLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name="logo-whatsapp"
                        size={20}
                        color={theme.colors.primary}
                        style={styles.actionIcon}
                      />
                      <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                        {t('whatsappBot.connectButton')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* ── Slack section ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('slackBot.title')}</Text>

        {slack.statusLoading ? (
          <View style={[styles.card, styles.centered]}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : slack.status?.linked ? (
          /* ── Linked state ── */
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>
                  {slack.status.slackProfileName
                    ? t('slackBot.linkedAs', { name: slack.status.slackProfileName })
                    : t('slackBot.linked')}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={slack.refresh}
              disabled={slack.statusLoading}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={theme.colors.primary}
                style={styles.actionIcon}
              />
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                {t('slackBot.refresh')}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.fieldRow}
              onPress={slack.unlink}
              disabled={slack.unlinkLoading}
            >
              {slack.unlinkLoading ? (
                <ActivityIndicator size="small" color={theme.colors.danger} />
              ) : (
                <>
                  <Ionicons
                    name="unlink-outline"
                    size={18}
                    color={theme.colors.danger}
                    style={styles.actionIcon}
                  />
                  <Text style={[styles.fieldLabel, { color: theme.colors.danger }]}>
                    {t('slackBot.disconnectButton')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Not linked state ── */
          <View style={styles.card}>
            {slack.linkCode ? (
              <>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                  {t('slackBot.codeInstructions', { code: slack.linkCode.code })}
                </Text>

                {/* Code text */}
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{slack.linkCode.code}</Text>
                </View>

                {/* Action buttons */}
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#4A154B' }]} onPress={slack.openSlack}>
                  <Ionicons
                    name="logo-slack"
                    size={20}
                    color="#ffffff"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.primaryButtonText}>{t('slackBot.openButton')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryButton} onPress={slack.copyCode}>
                  <Ionicons
                    name="copy-outline"
                    size={18}
                    color={theme.colors.primary}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.secondaryButtonText}>{t('slackBot.copyCode')}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.fieldRow} onPress={slack.refresh}>
                  <Ionicons
                    name="refresh-outline"
                    size={18}
                    color={theme.colors.primary}
                    style={styles.actionIcon}
                  />
                  <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                    {t('slackBot.refresh')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* ── Add to Slack (workspace-admin action) ─────────── */}
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#4A154B', marginBottom: theme.spacing[2] }]}
                  onPress={slack.addToSlack}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color="#ffffff"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.primaryButtonText}>{t('slackBot.addToSlack')}</Text>
                </TouchableOpacity>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                  {t('slackBot.addToSlackHint')}
                </Text>

                <View style={styles.divider} />

                {/* ── Personal account link (per-user code) ─────────── */}
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                  {t('slackBot.subtitle')}
                </Text>
                <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[3] }]}>
                  {t('slackBot.notLinked')}
                </Text>
                <TouchableOpacity
                  style={[styles.fieldRow, { justifyContent: 'center' }]}
                  onPress={slack.generateCode}
                  disabled={slack.codeLoading}
                >
                  {slack.codeLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name="logo-slack"
                        size={20}
                        color={theme.colors.primary}
                        style={styles.actionIcon}
                      />
                      <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                        {t('slackBot.connectButton')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
  // No `container`: `SettingsScreenFrame` owns the safe area and the
  // background on the full-page path, and the shell owns them in a pane.
  scrollView: {
    flex: 1,
  },
  content: {
    // `paddingBottom` is composed at the call site from the system inset, so
    // it is deliberately not set here - a style array's last entry wins, and
    // two sources for one padding is how one of them silently stops mattering.
    padding: theme.spacing[4],
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  centered: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 80,
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldInfo: {
    flex: 1,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
  actionIcon: {
    marginRight: theme.spacing[2],
  },
  qrContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
  },
  codeBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
    alignItems: 'center' as const,
  },
  codeText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    letterSpacing: 6,
    textAlign: 'center' as const,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#25D366',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  primaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: '#ffffff',
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  secondaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  buttonIcon: {
    marginRight: theme.spacing[2],
  },
});
