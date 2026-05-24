import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';

// ── WhatsApp types (moved verbatim from whatsapp.tsx) ──────────────────────

interface WhatsAppStatus {
  linked: boolean;
  waPhoneNumber?: string;
  waProfileName?: string | null;
  linkedAt?: string;
}

interface LinkCodeState {
  code: string;
  expiresAt: string;
  waPhoneNumber: string;
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function BotsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // ── Telegram state (moved verbatim from notifications.tsx) ────────────────

  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>('');
  const [telegramLoading, setTelegramLoading] = useState(false);

  const loadTelegramStatus = useCallback(async () => {
    try {
      const status = await api.getTelegramLinkStatus();
      setTelegramLinked(status.linked);
      setTelegramUsername(status.telegramUsername || null);
    } catch {
      // Ignore — telegram feature may not be available
    }
  }, []);

  useEffect(() => {
    loadTelegramStatus();
  }, [loadTelegramStatus]);

  const handleGenerateTelegramCode = async () => {
    setTelegramLoading(true);
    try {
      const result = await api.generateTelegramLinkCode();
      setTelegramLinkCode(result.code);
      setTelegramBotUsername(result.botUsername);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleCopyTelegramCode = async () => {
    if (telegramLinkCode) {
      await Clipboard.setStringAsync(telegramLinkCode);
      Alert.alert(t('settings.telegram.codeCopied'));
    }
  };

  const handleUnlinkTelegram = async () => {
    Alert.alert(
      t('settings.telegram.disconnect'),
      t('settings.telegram.disconnectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.telegram.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.unlinkTelegram();
              setTelegramLinked(false);
              setTelegramUsername(null);
              setTelegramLinkCode(null);
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  // ── WhatsApp state (moved verbatim from whatsapp.tsx) ────────────────────

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCodeState | null>(null);
  const [waStatusLoading, setWaStatusLoading] = useState(true);
  const [waCodeLoading, setWaCodeLoading] = useState(false);
  const [waUnlinkLoading, setWaUnlinkLoading] = useState(false);

  const loadWaStatus = useCallback(async () => {
    try {
      const result = await api.getWhatsAppLinkStatus();
      setWaStatus(result);
      if (result.linked) {
        setLinkCode(null);
      }
    } catch {
      // Ignore — feature may not be available yet
    } finally {
      setWaStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWaStatus();
  }, [loadWaStatus]);

  useFocusEffect(
    useCallback(() => {
      loadWaStatus();
    }, [loadWaStatus]),
  );

  const handleGenerateWaCode = async () => {
    setWaCodeLoading(true);
    try {
      const result = await api.generateWhatsAppLinkCode();
      setLinkCode(result);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setWaCodeLoading(false);
    }
  };

  const buildWaMeUrl = (waPhoneNumber: string, code: string) => {
    const phoneDigits = waPhoneNumber.replace(/^\+/, '');
    return `https://wa.me/${phoneDigits}?text=link%20${code}`;
  };

  const handleOpenWhatsApp = () => {
    if (!linkCode) return;
    const url = buildWaMeUrl(linkCode.waPhoneNumber, linkCode.code);
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('errors.unknown'));
    });
  };

  const handleCopyWaCode = async () => {
    if (!linkCode) return;
    await Clipboard.setStringAsync(linkCode.code);
    Alert.alert('', t('whatsappBot.copyCode'));
  };

  const handleWaRefresh = async () => {
    setWaStatusLoading(true);
    await loadWaStatus();
  };

  const handleUnlinkWa = () => {
    Alert.alert(
      t('whatsappBot.confirmDisconnect'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('whatsappBot.disconnectButton'),
          style: 'destructive',
          onPress: async () => {
            setWaUnlinkLoading(true);
            try {
              await api.unlinkWhatsApp();
              setWaStatus({ linked: false });
              setLinkCode(null);
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            } finally {
              setWaUnlinkLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>

        {/* ── Telegram section ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.telegram.title')}</Text>
          <View style={styles.card}>
            {telegramLinked ? (
              <>
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>{t('settings.telegram.linked')}</Text>
                    {telegramUsername && (
                      <Text style={styles.fieldDesc}>@{telegramUsername}</Text>
                    )}
                  </View>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
                </View>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.fieldRow} onPress={handleUnlinkTelegram}>
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
                {telegramLinkCode ? (
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
                      onPress={handleCopyTelegramCode}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.fieldLabel,
                            { fontSize: 24, letterSpacing: 4, textAlign: 'center' },
                          ]}
                        >
                          {telegramLinkCode}
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
                        botUsername: telegramBotUsername || 'BudgetBot',
                      })}
                    </Text>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.fieldRow, { justifyContent: 'center' }]}
                    onPress={handleGenerateTelegramCode}
                    disabled={telegramLoading}
                  >
                    {telegramLoading ? (
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

          {waStatusLoading ? (
            <View style={[styles.card, styles.centered]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : waStatus?.linked ? (
            /* ── Linked state ── */
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <View style={styles.fieldInfo}>
                  <Text style={styles.fieldLabel}>
                    {t('whatsappBot.linkedAs', {
                      name: waStatus.waProfileName ?? waStatus.waPhoneNumber ?? '',
                    })}
                  </Text>
                  {waStatus.waPhoneNumber && waStatus.waProfileName && (
                    <Text style={styles.fieldDesc}>{waStatus.waPhoneNumber}</Text>
                  )}
                </View>
                <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
              </View>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.fieldRow}
                onPress={handleWaRefresh}
                disabled={waStatusLoading}
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
                onPress={handleUnlinkWa}
                disabled={waUnlinkLoading}
              >
                {waUnlinkLoading ? (
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
              {linkCode ? (
                <>
                  <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                    {t('whatsappBot.codeInstructions')}
                  </Text>

                  {/* QR code */}
                  <View style={styles.qrContainer}>
                    <QRCode
                      value={buildWaMeUrl(linkCode.waPhoneNumber, linkCode.code)}
                      size={220}
                      backgroundColor={theme.colors.surface}
                      color={theme.colors.textPrimary}
                    />
                  </View>

                  {/* Code text */}
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>{linkCode.code}</Text>
                  </View>

                  {/* Action buttons */}
                  <TouchableOpacity style={styles.primaryButton} onPress={handleOpenWhatsApp}>
                    <Ionicons
                      name="logo-whatsapp"
                      size={20}
                      color="#ffffff"
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.primaryButtonText}>{t('whatsappBot.openButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyWaCode}>
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={theme.colors.primary}
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.secondaryButtonText}>{t('whatsappBot.copyCode')}</Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  <TouchableOpacity style={styles.fieldRow} onPress={handleWaRefresh}>
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
                    onPress={handleGenerateWaCode}
                    disabled={waCodeLoading}
                  >
                    {waCodeLoading ? (
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
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
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
